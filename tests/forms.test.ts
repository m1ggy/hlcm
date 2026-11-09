import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Intake forms (docs/forms-plan.md): the shared rules, saving a submission,
// and who hears about it (in-app, email, text, the person's own copy).

const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: mail.send,
  getEmailBranding: async () => ({ appUrl: "https://forms.example.test", brand: "Forms Co" }),
  renderEmailLayout: (o: { bodyHtml: string }) => o.bodyHtml,
}));
const sms = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/twilio", async (orig) => {
  const real = await orig<typeof import("@/lib/twilio")>();
  return { ...real, sendSmsWith: sms.send };
});
vi.mock("@/lib/storage", () => ({
  saveUploadedFile: vi.fn(async (file: File) => ({ storageKey: `org/test/${file.name}`, sizeBytes: file.size, generation: BigInt(1) })),
}));

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { TwilioApiError } from "@/lib/twilio";
import { cleanAnswers, firstNameFrom, isFieldVisible, normalizePhone, validateAnswers, type FormFieldDef } from "@/lib/form-logic";
import { alertForSubmission, recordSubmission } from "@/lib/form-submit";

const ORG = { id: "org_forms", slug: "forms-co", name: "Forms Co" };
const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);

const F = (key: string, type: FormFieldDef["type"], extra: Partial<FormFieldDef> = {}): FormFieldDef => ({ key, label: key, type, required: false, options: [], ...extra });

describe("form rules", () => {
  const fields = [
    F("care", "RADIO", { options: ["Myself", "A parent"], required: true }),
    F("parent_name", "TEXT", { required: true, showIf: { key: "care", op: "equals", value: "A parent" } }),
    F("needs", "MULTI_CHECKBOX", { options: ["Meals", "Bathing"] }),
    F("bathing_notes", "LONG_TEXT", { showIf: { key: "needs", op: "includes", value: "Bathing" } }),
    F("email", "EMAIL", { required: true }),
    F("phone", "PHONE"),
    F("hours", "NUMBER"),
  ];

  it("shows questions based on earlier answers", () => {
    expect(isFieldVisible(fields[1], fields, { care: "Myself" })).toBe(false);
    expect(isFieldVisible(fields[1], fields, { care: "a parent" })).toBe(true); // not case-sensitive
    expect(isFieldVisible(fields[3], fields, { needs: ["Meals", "Bathing"] })).toBe(true);
    expect(isFieldVisible(fields[3], fields, { needs: ["Meals"] })).toBe(false);
  });

  it("only requires visible questions, and checks formats", () => {
    expect(validateAnswers(fields, { care: "Myself", email: "a@b.co" })).toEqual({});
    expect(validateAnswers(fields, { care: "A parent", email: "a@b.co" })).toEqual({ parent_name: "This is required" });
    expect(Object.keys(validateAnswers(fields, { care: "Nope", email: "nope", phone: "12", hours: "lots" })).sort()).toEqual(["care", "email", "hours", "phone"]);
  });

  it("drops answers to hidden questions and normalizes phones", () => {
    expect(cleanAnswers(fields, { care: "Myself", parent_name: "Ann", email: " a@b.co ", phone: "(555) 123-4567" })).toEqual({ care: "Myself", email: "a@b.co", phone: "+15551234567" });
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("123")).toBeNull();
  });

  it("finds a first name for texts", () => {
    expect(firstNameFrom([{ key: "full_name", label: "Full name", type: "TEXT" }], { full_name: "Dana  Lee" })).toBe("Dana");
    expect(firstNameFrom([{ key: "x", label: "Company", type: "TEXT" }], { x: "Acme" })).toBeNull();
  });
});

let templateId = "";
let ada = "";
let mo = "";
let val = "";

beforeAll(async () => {
  process.env.SMS_TWILIO_ACCOUNT_SID = "AC_test";
  process.env.SMS_TWILIO_AUTH_TOKEN = "token";
  process.env.SMS_TWILIO_FROM = "+15550000000";
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: ORG });
  forgetOrg(ORG.slug);
  const t = tenantDb(ORG.id);
  const mk = (name: string, data: object = {}) =>
    t.user.create({ data: { name, email: `${name.toLowerCase()}@forms.test`, passwordHash: "x", role: "MANAGER", ...data } });
  ada = (await mk("Ada", { phone: "+15551110000", smsFormAlerts: true })).id;
  mo = (await mk("Mo", { phone: "+15552220000", smsFormAlerts: false })).id; // never opted in
  val = (await mk("Val", { phone: "+15553330000", smsFormAlerts: true })).id;
  const template = await t.formTemplate.create({
    data: {
      name: "Home care intake",
      slug: "intake",
      createdById: ada,
      notifyUserIds: [ada],
      notifyTextUserIds: [ada, mo, val],
      sendCopyToSubmitter: true,
      thankYouMessage: "We'll call you within a day.",
      fields: {
        create: [
          { key: "full_name", label: "Full name", type: "TEXT", required: true, sortOrder: 0, clientField: "name" },
          { key: "email", label: "Email", type: "EMAIL", required: true, sortOrder: 1 },
          { key: "care", label: "Who needs care?", type: "RADIO", options: ["Myself", "A parent"], required: true, sortOrder: 2 },
          { key: "parent", label: "Parent's name", type: "TEXT", required: true, sortOrder: 3, showIf: { key: "care", op: "equals", value: "A parent" } },
          { key: "docs", label: "Documents", type: "FILE", sortOrder: 4 },
        ],
      },
    },
  });
  templateId = template.id;
});

beforeEach(() => {
  mail.send.mockReset().mockResolvedValue(undefined);
  sms.send.mockReset().mockResolvedValue("SM123");
});

afterAll(async () => {
  for (const k of ["SMS_TWILIO_ACCOUNT_SID", "SMS_TWILIO_AUTH_TOKEN", "SMS_TWILIO_FROM"]) delete process.env[k];
  await prisma.$disconnect();
});

describe("saving a submission", () => {
  it("keeps visible answers, the field labels of the day, and files", async () => {
    await inOrg(async () => {
      const file = new File([new Uint8Array(2000)], "license.pdf", { type: "application/pdf" });
      const { submissionId, thankYouMessage } = await recordSubmission({
        templateId,
        answers: { full_name: "Dana Lee", email: "dana@example.com", care: "Myself", parent: "should be dropped" },
        files: [{ key: "docs", file }],
        ip: "203.0.113.5",
      });
      expect(thankYouMessage).toBe("We'll call you within a day.");
      const s = await tenantDb(ORG.id).formSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { files: true } });
      expect(s.answers).toEqual({ full_name: "Dana Lee", email: "dana@example.com", care: "Myself" });
      expect((s.fieldsSnapshot as { key: string; label: string }[]).map((f) => f.label)).toEqual(["Full name", "Email", "Who needs care?", "Parent's name", "Documents"]);
      expect(s.files.map((f) => f.fileName)).toEqual(["license.pdf"]);
    });
  });

  it("refuses missing answers and odd files with a readable message", async () => {
    await inOrg(async () => {
      await expect(recordSubmission({ templateId, answers: { full_name: "Dana", email: "d@x.co", care: "A parent" }, files: [], ip: null })).rejects.toThrow(/Parent's name: This is required/);
      await expect(
        recordSubmission({ templateId, answers: { full_name: "Dana", email: "d@x.co", care: "Myself" }, files: [{ key: "docs", file: new File(["x"], "virus.exe") }], ip: null })
      ).rejects.toThrow(/isn't a supported file/);
    });
  });
});

describe("alerts", () => {
  it("notifies in the app and by email, texts opted-in staff, and emails the person a copy", async () => {
    await inOrg(async () => {
      const { submissionId } = await recordSubmission({ templateId, answers: { full_name: "Dana Lee", email: "dana@example.com", care: "Myself" }, files: [], ip: null });
      const result = await alertForSubmission(submissionId);
      expect(result.notified).toEqual([ada]);
      expect(result.texted.sort()).toEqual([ada, val].sort()); // Mo never turned texts on
      expect(sms.send).toHaveBeenCalledTimes(2);
      const body = sms.send.mock.calls[0][2] as string;
      expect(body).toContain('New "Home care intake" submission from Dana at Forms Co');
      expect(body).not.toContain("dana@example.com"); // nothing else they wrote
      expect(result.copyTo).toBe("dana@example.com");
      expect(mail.send.mock.calls.map((c) => c[0].to)).toEqual(expect.arrayContaining(["ada@forms.test", "dana@example.com"]));
      const bell = await tenantDb(ORG.id).notification.findFirst({ where: { userId: ada, entityId: submissionId } });
      expect(bell?.type).toBe("FORM_SUBMITTED");
      expect(await tenantDb(ORG.id).smsLog.count({ where: { entityId: submissionId, ok: true } })).toBe(2);
    });
  });

  it("stops texting someone who replied STOP", async () => {
    await inOrg(async () => {
      sms.send.mockImplementation(async (_c: unknown, to: string) => {
        if (to === "+15553330000") throw new TwilioApiError("Attempt to send to unsubscribed recipient", 400, 21610);
        return "SM1";
      });
      const { submissionId } = await recordSubmission({ templateId, answers: { full_name: "Lee", email: "l@x.co", care: "Myself" }, files: [], ip: null });
      const first = await alertForSubmission(submissionId);
      expect(first.texted).toEqual([ada]);
      expect((await tenantDb(ORG.id).user.findUniqueOrThrow({ where: { id: val } })).smsOptedOutAt).not.toBeNull();
      sms.send.mockClear();
      await alertForSubmission(submissionId);
      expect(sms.send.mock.calls.map((c) => c[1])).toEqual(["+15551110000"]); // Val is skipped now
    });
  });

  it("logs instead of texting when texting isn't set up", async () => {
    const saved = process.env.SMS_TWILIO_FROM;
    const savedFallback = process.env.TWILIO_FROM_NUMBER;
    delete process.env.SMS_TWILIO_FROM;
    delete process.env.TWILIO_FROM_NUMBER;
    try {
      await inOrg(async () => {
        const { submissionId } = await recordSubmission({ templateId, answers: { full_name: "Kim", email: "k@x.co", care: "Myself" }, files: [], ip: null });
        const r = await alertForSubmission(submissionId);
        expect(r.texted).toEqual([]);
        expect(sms.send).not.toHaveBeenCalled();
        expect(await tenantDb(ORG.id).smsLog.count({ where: { entityId: submissionId, ok: false } })).toBeGreaterThan(0);
      });
    } finally {
      process.env.SMS_TWILIO_FROM = saved;
      if (savedFallback !== undefined) process.env.TWILIO_FROM_NUMBER = savedFallback;
    }
  });

  it("uses the server's existing Twilio settings when the SMS_ ones aren't set", async () => {
    const keys = ["SMS_TWILIO_ACCOUNT_SID", "SMS_TWILIO_AUTH_TOKEN", "SMS_TWILIO_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys.slice(0, 3)) delete process.env[k];
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC_legacy", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+15559990000" });
    try {
      const { platformSmsCreds } = await import("@/lib/sms");
      expect(platformSmsCreds()).toEqual({ accountSid: "AC_legacy", authToken: "tok", fromNumber: "+15559990000" });
    } finally {
      for (const k of keys) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
    }
  });
});
