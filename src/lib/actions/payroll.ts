"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { deleteStoredFile } from "@/lib/storage";
import { dayRangeToInstants, summarizeByUser, toDateInputValue, type BreakDeductionRule } from "@/lib/time-entries";
import {
  PAYROLL_TIMEZONE,
  PAYROLL_METHODS,
  dayToDate,
  dateToDay,
  formatPeriod,
  isValidPeriod,
  periodForDay,
  recentPeriods,
  roundMoney,
  type PeriodRange,
} from "@/lib/payroll";

// Mark paid / payroll files are ACCOUNTANT-only (+ OWNER/DEVELOPER, who pass
// every requireRole) — plain ADMIN and MANAGER can only view. Same gate as
// canManagePayroll() in src/lib/rbac.ts. See docs/payroll-plan.md.
const MANAGE = ["ACCOUNTANT"] as const;
const VIEW = ["ADMIN", "MANAGER"] as const;

class PayrollError extends UserFacingError {}

function parsePeriod(start: string): PeriodRange {
  const range = periodForDay(start);
  if (!isValidPeriod({ start, end: range.end })) throw new PayrollError("That isn't a pay period");
  return range;
}

function revalidatePayroll() {
  revalidatePath("/payroll");
  revalidatePath("/time");
  revalidatePath("/hours");
  revalidatePath("/today");
}

/** The PayPeriod row for `range`, created on first use. */
async function ensurePeriod(range: PeriodRange) {
  return prisma.payPeriod.upsert({
    where: { startDate_endDate: { startDate: dayToDate(range.start), endDate: dayToDate(range.end) } },
    create: { startDate: dayToDate(range.start), endDate: dayToDate(range.end) },
    update: {},
  });
}

/**
 * Live hours and gross per person for a period. A shift counts in the
 * period of the day it started (in PAYROLL_TIMEZONE) — the same rule the
 * time lock uses — so a shift crossing midnight on the 15th is counted
 * once, not in both periods. Open shifts aren't counted (hasOpenEntry).
 */
async function computePeriod(range: PeriodRange, userIds?: string[]) {
  const { from, to } = dayRangeToInstants(range.start, range.end, PAYROLL_TIMEZONE);
  const [entries, deductions] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { clockIn: { gte: from, lte: to }, ...(userIds ? { userId: { in: userIds } } : {}) },
      select: { userId: true, clockIn: true, clockOut: true, user: { select: { name: true, hourlyRate: true } } },
    }),
    prisma.timesheetBreakDeduction.findMany({
      where: { fromDate: { lte: dayToDate(range.end) }, toDate: { gte: dayToDate(range.start) } },
    }),
  ]);
  const rules: BreakDeductionRule[] = deductions.map((d) => ({
    userId: d.userId,
    fromDate: d.fromDate,
    toDate: d.toDate,
    minutesPerDay: d.minutesPerDay,
  }));
  return summarizeByUser(entries, rules, PAYROLL_TIMEZONE);
}

// --- Accountant / management side -------------------------------------------

export type PeriodSummary = {
  start: string;
  end: string;
  label: string;
  people: number;
  paid: number;
  awaiting: number;
  problems: number;
};

/** Recent periods for the /payroll picker, with how far along each is. */
export async function listPayrollPeriods(): Promise<PeriodSummary[]> {
  await requireRole([...VIEW]);
  const periods = recentPeriods(12);
  const oldest = periods[periods.length - 1];
  const newest = periods[0];
  const { from, to } = dayRangeToInstants(oldest.start, newest.end, PAYROLL_TIMEZONE);

  const [entries, payments] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { clockIn: { gte: from, lte: to }, clockOut: { not: null } },
      select: { userId: true, clockIn: true },
    }),
    prisma.payrollPayment.findMany({
      where: { payPeriod: { startDate: { gte: dayToDate(oldest.start) } } },
      select: {
        userId: true,
        acknowledgedAt: true,
        problemReportedAt: true,
        problemResolvedAt: true,
        payPeriod: { select: { startDate: true } },
      },
    }),
  ]);

  const peopleByPeriod = new Map<string, Set<string>>();
  for (const e of entries) {
    const start = periodForDay(toDateInputValue(e.clockIn, PAYROLL_TIMEZONE)).start;
    const set = peopleByPeriod.get(start) ?? new Set<string>();
    set.add(e.userId);
    peopleByPeriod.set(start, set);
  }
  for (const p of payments) {
    const start = dateToDay(p.payPeriod.startDate);
    const set = peopleByPeriod.get(start) ?? new Set<string>();
    set.add(p.userId);
    peopleByPeriod.set(start, set);
  }

  return periods.map((range) => {
    const mine = payments.filter((p) => dateToDay(p.payPeriod.startDate) === range.start);
    return {
      ...range,
      label: formatPeriod(range),
      people: peopleByPeriod.get(range.start)?.size ?? 0,
      paid: mine.length,
      awaiting: mine.filter((p) => !p.acknowledgedAt && !(p.problemReportedAt && !p.problemResolvedAt)).length,
      problems: mine.filter((p) => !p.acknowledgedAt && p.problemReportedAt && !p.problemResolvedAt).length,
    };
  });
}

export type PayrollRow = {
  userId: string;
  userName: string;
  // Live numbers from time entries right now.
  hours: number;
  breakHours: number;
  hourlyRate: number | null;
  gross: number | null;
  onTheClock: boolean;
  payment: {
    id: string;
    hours: number;
    breakHours: number;
    hourlyRate: number | null;
    grossAmount: number;
    netAmount: number;
    method: (typeof PAYROLL_METHODS)[number];
    reference: string | null;
    note: string | null;
    paidOn: string;
    markedBy: string;
    acknowledgedAt: Date | null;
    problemReportedAt: Date | null;
    problemNote: string | null;
    problemResolvedAt: Date | null;
    files: PayrollFile[];
  } | null;
};

export type PayrollFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
};

const fileSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { name: true } },
} as const;

/** Everything /payroll shows for one period: one row per person with time
 * or a payment, plus the period's own files. */
export async function getPayrollPeriod(start: string) {
  await requireRole([...VIEW]);
  const range = parsePeriod(start);

  const [totals, period] = await Promise.all([
    computePeriod(range),
    prisma.payPeriod.findUnique({
      where: { startDate_endDate: { startDate: dayToDate(range.start), endDate: dayToDate(range.end) } },
      include: {
        payments: {
          include: {
            user: { select: { name: true } },
            markedBy: { select: { name: true } },
            attachments: { select: fileSelect, orderBy: { createdAt: "desc" } },
          },
        },
        attachments: { where: { payrollPaymentId: null }, select: fileSelect, orderBy: { createdAt: "desc" } },
      },
    }),
  ]);

  const rows = new Map<string, PayrollRow>();
  for (const t of totals) {
    rows.set(t.userId, {
      userId: t.userId,
      userName: t.userName,
      hours: t.hours,
      breakHours: t.breakHours,
      hourlyRate: t.hourlyRate,
      gross: t.pay != null ? roundMoney(t.pay) : null,
      onTheClock: t.hasOpenEntry,
      payment: null,
    });
  }
  for (const p of period?.payments ?? []) {
    const row: PayrollRow = rows.get(p.userId) ?? {
      userId: p.userId,
      userName: p.user.name,
      hours: 0,
      breakHours: 0,
      hourlyRate: null,
      gross: null,
      onTheClock: false,
      payment: null,
    };
    row.payment = {
      id: p.id,
      hours: p.hours,
      breakHours: p.breakHours,
      hourlyRate: p.hourlyRate,
      grossAmount: p.grossAmount,
      netAmount: p.netAmount,
      method: p.method,
      reference: p.reference,
      note: p.note,
      paidOn: dateToDay(p.paidOn),
      markedBy: p.markedBy.name,
      acknowledgedAt: p.acknowledgedAt,
      problemReportedAt: p.problemReportedAt,
      problemNote: p.problemNote,
      problemResolvedAt: p.problemResolvedAt,
      files: p.attachments,
    };
    rows.set(p.userId, row);
  }

  return {
    ...range,
    label: formatPeriod(range),
    rows: [...rows.values()]
      // Only people with time or a payment — a zero-hour row with no
      // payment (e.g. only an open shift) still shows, since it's a warning.
      .filter((r) => r.hours > 0 || r.payment || r.onTheClock)
      .sort((a, b) => a.userName.localeCompare(b.userName)),
    files: period?.attachments ?? [],
  };
}

const moneySchema = z.coerce.number().min(0, "Amounts can't be negative").max(1_000_000);
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const markPaidSchema = z.object({
  start: dayString,
  paidOn: dayString,
  method: z.enum(PAYROLL_METHODS),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  people: z
    .array(
      z.object({
        userId: z.string().min(1),
        // Omitted = use the computed hours × rate.
        grossAmount: moneySchema.optional(),
        netAmount: moneySchema,
      })
    )
    .min(1, "Choose at least one person"),
});

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new PayrollError(result.error.issues[0]?.message ?? "Check the details and try again");
  return result.data;
}

/** Marks one or more people paid for a period — the single "Mark paid"
 * dialog sends one person, "Mark all paid" sends everyone unpaid. Hours,
 * rate and gross are snapshotted here, and from now on their time in the
 * period is locked (src/lib/payroll-lock.ts). */
async function markPaidImpl(input: z.input<typeof markPaidSchema>) {
  const session = await requireRole([...MANAGE]);
  const parsed = parse(markPaidSchema, input);
  const range = parsePeriod(parsed.start);
  const userIds = parsed.people.map((p) => p.userId);
  if (new Set(userIds).size !== userIds.length) throw new PayrollError("Someone is listed twice");

  const period = await ensurePeriod(range);
  const [totals, already, users] = await Promise.all([
    computePeriod(range, userIds),
    prisma.payrollPayment.findMany({
      where: { payPeriodId: period.id, userId: { in: userIds } },
      select: { user: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true, hourlyRate: true } }),
  ]);
  if (already.length > 0) {
    throw new PayrollError(`Already marked paid: ${already.map((a) => a.user.name).join(", ")} — refresh the page`);
  }
  if (users.length !== userIds.length) throw new PayrollError("One of these people no longer exists — refresh the page");

  const byUser = new Map(totals.map((t) => [t.userId, t]));
  const data = parsed.people.map((p) => {
    const user = users.find((u) => u.id === p.userId)!;
    const t = byUser.get(p.userId);
    const computed = t?.pay != null ? roundMoney(t.pay) : null;
    const gross = p.grossAmount ?? computed;
    if (gross == null) throw new PayrollError(`${user.name} has no hourly rate — enter a gross amount`);
    return {
      payPeriodId: period.id,
      userId: p.userId,
      hours: t?.hours ?? 0,
      breakHours: t?.breakHours ?? 0,
      hourlyRate: t?.hourlyRate ?? user.hourlyRate,
      grossAmount: roundMoney(gross),
      netAmount: roundMoney(p.netAmount),
      method: parsed.method,
      reference: parsed.reference || null,
      note: parsed.note || null,
      paidOn: dayToDate(parsed.paidOn),
      markedById: session.user.id,
    };
  });

  await prisma.payrollPayment.createMany({ data });
  const created = await prisma.payrollPayment.findMany({
    where: { payPeriodId: period.id, userId: { in: userIds } },
    select: { id: true, userId: true, netAmount: true },
  });

  const label = formatPeriod(range);
  for (const row of created) {
    const user = users.find((u) => u.id === row.userId)!;
    await recordAudit({
      entityType: "PayrollPayment",
      entityId: row.id,
      action: "mark_paid",
      actorId: session.user.id,
      newValue: `${user.name}, ${label}, net ${row.netAmount.toFixed(2)} (${parsed.method})`,
    });
    await notify(
      {
        userId: row.userId,
        type: "PAYROLL_PAID",
        message: `Your pay for ${label} was sent — please confirm you received it.`,
        entityType: user.role === "CAREGIVER" ? "MyPayCaregiver" : "MyPay",
        entityId: row.id,
      },
      session.user.id
    );
  }

  revalidatePayroll();
  return { count: created.length };
}

export async function markPaid(input: z.input<typeof markPaidSchema>) {
  return toActionResult(() => markPaidImpl(input));
}

const updatePaymentSchema = z.object({
  grossAmount: moneySchema,
  netAmount: moneySchema,
  paidOn: dayString,
  method: z.enum(PAYROLL_METHODS),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

/** Fixes the details of a payment (amounts, date, method). Hours stay as
 * snapshotted — to re-count hours, undo the payment and mark it again. */
async function updatePaymentImpl(id: string, input: z.input<typeof updatePaymentSchema>) {
  const session = await requireRole([...MANAGE]);
  const parsed = parse(updatePaymentSchema, input);
  const before = await prisma.payrollPayment.findUniqueOrThrow({ where: { id } });

  await prisma.payrollPayment.update({
    where: { id },
    data: {
      grossAmount: roundMoney(parsed.grossAmount),
      netAmount: roundMoney(parsed.netAmount),
      paidOn: dayToDate(parsed.paidOn),
      method: parsed.method,
      reference: parsed.reference || null,
      note: parsed.note || null,
    },
  });

  await recordAudit({
    entityType: "PayrollPayment",
    entityId: id,
    action: "edit_payment",
    actorId: session.user.id,
    oldValue: `gross ${before.grossAmount.toFixed(2)}, net ${before.netAmount.toFixed(2)}, ${dateToDay(before.paidOn)}, ${before.method}`,
    newValue: `gross ${parsed.grossAmount.toFixed(2)}, net ${parsed.netAmount.toFixed(2)}, ${parsed.paidOn}, ${parsed.method}`,
  });

  revalidatePayroll();
}

export async function updatePayment(id: string, input: z.input<typeof updatePaymentSchema>) {
  return toActionResult(() => updatePaymentImpl(id, input));
}

/** Removes a payment: the person goes back to "Not paid", their time in the
 * period unlocks, and their per-person files are deleted with it. */
async function undoPaidImpl(id: string) {
  const session = await requireRole([...MANAGE]);
  const payment = await prisma.payrollPayment.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { name: true } },
      payPeriod: true,
      attachments: { select: { storageKey: true } },
    },
  });

  await prisma.payrollPayment.delete({ where: { id } });
  for (const file of payment.attachments) await deleteStoredFile(file.storageKey);

  await recordAudit({
    entityType: "PayrollPayment",
    entityId: id,
    action: "undo_paid",
    actorId: session.user.id,
    oldValue: `${payment.user.name}, ${formatPeriod({ start: dateToDay(payment.payPeriod.startDate), end: dateToDay(payment.payPeriod.endDate) })}, net ${payment.netAmount.toFixed(2)}`,
  });

  revalidatePayroll();
}

export async function undoPaid(id: string) {
  return toActionResult(() => undoPaidImpl(id));
}

/** The accountant has sorted out a reported problem — the person is asked
 * to confirm receipt again. */
async function resolveProblemImpl(id: string) {
  const session = await requireRole([...MANAGE]);
  const payment = await prisma.payrollPayment.findUniqueOrThrow({
    where: { id },
    include: { user: { select: { role: true } }, payPeriod: true },
  });
  if (!payment.problemReportedAt || payment.problemResolvedAt) throw new PayrollError("There's no open problem on this payment");

  await prisma.payrollPayment.update({
    where: { id },
    data: { problemResolvedAt: new Date(), problemResolvedById: session.user.id },
  });

  const label = formatPeriod({ start: dateToDay(payment.payPeriod.startDate), end: dateToDay(payment.payPeriod.endDate) });
  await recordAudit({ entityType: "PayrollPayment", entityId: id, action: "resolve_problem", actorId: session.user.id });
  await notify(
    {
      userId: payment.userId,
      type: "PAYROLL_PAID",
      message: `The problem you reported with your pay for ${label} was resolved — please confirm you received it.`,
      entityType: payment.user.role === "CAREGIVER" ? "MyPayCaregiver" : "MyPay",
      entityId: id,
    },
    session.user.id
  );

  revalidatePayroll();
}

export async function resolvePaymentProblem(id: string) {
  return toActionResult(() => resolveProblemImpl(id));
}

// --- The paid person's side --------------------------------------------------

export type MyPayment = {
  id: string;
  start: string;
  end: string;
  label: string;
  hours: number;
  grossAmount: number;
  netAmount: number;
  method: (typeof PAYROLL_METHODS)[number];
  reference: string | null;
  paidOn: string;
  acknowledgedAt: Date | null;
  problemReportedAt: Date | null;
  problemNote: string | null;
  problemResolvedAt: Date | null;
  files: PayrollFile[];
};

/** The signed-in person's own payments, newest period first. Only their
 * per-person files — period files (the whole payroll register) never
 * reach this side. */
export async function listMyPayments(limit = 24): Promise<MyPayment[]> {
  const session = await requireSession();
  const rows = await prisma.payrollPayment.findMany({
    where: { userId: session.user.id },
    include: { payPeriod: true, attachments: { select: fileSelect, orderBy: { createdAt: "desc" } } },
    orderBy: { payPeriod: { startDate: "desc" } },
    take: limit,
  });
  return rows.map((p) => {
    const range = { start: dateToDay(p.payPeriod.startDate), end: dateToDay(p.payPeriod.endDate) };
    return {
      id: p.id,
      ...range,
      label: formatPeriod(range),
      hours: p.hours,
      grossAmount: p.grossAmount,
      netAmount: p.netAmount,
      method: p.method,
      reference: p.reference,
      paidOn: dateToDay(p.paidOn),
      acknowledgedAt: p.acknowledgedAt,
      problemReportedAt: p.problemReportedAt,
      problemNote: p.problemNote,
      problemResolvedAt: p.problemResolvedAt,
      files: p.attachments,
    };
  });
}

/** How many of my payments still need me to confirm — the Today banner. */
export async function countMyUnconfirmedPayments() {
  const session = await requireSession();
  return prisma.payrollPayment.count({
    where: {
      userId: session.user.id,
      acknowledgedAt: null,
      // An open problem is waiting on the accountant, not on me.
      OR: [{ problemReportedAt: null }, { problemResolvedAt: { not: null } }],
    },
  });
}

async function ownPayment(id: string) {
  const session = await requireSession();
  const payment = await prisma.payrollPayment.findUnique({ where: { id }, include: { payPeriod: true } });
  if (!payment || payment.userId !== session.user.id) throw new PayrollError("That payment isn't yours");
  return { session, payment };
}

async function acknowledgeImpl(id: string) {
  const { session, payment } = await ownPayment(id);
  if (payment.acknowledgedAt) return;
  await prisma.payrollPayment.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  await recordAudit({ entityType: "PayrollPayment", entityId: id, action: "acknowledge", actorId: session.user.id });
  revalidatePayroll();
}

export async function acknowledgePayment(id: string) {
  return toActionResult(() => acknowledgeImpl(id));
}

const problemSchema = z.string().trim().min(1, "Say what's wrong").max(2000);

async function reportProblemImpl(id: string, note: string) {
  const { session, payment } = await ownPayment(id);
  const parsedNote = parse(problemSchema, note);
  if (payment.acknowledgedAt) throw new PayrollError("You already confirmed this payment — contact the office directly");

  await prisma.payrollPayment.update({
    where: { id },
    data: { problemReportedAt: new Date(), problemNote: parsedNote, problemResolvedAt: null, problemResolvedById: null },
  });
  await recordAudit({
    entityType: "PayrollPayment",
    entityId: id,
    action: "report_problem",
    actorId: session.user.id,
    newValue: parsedNote,
  });

  // Every active accountant; a workspace without one falls back to owners.
  const start = dateToDay(payment.payPeriod.startDate);
  const label = formatPeriod({ start, end: dateToDay(payment.payPeriod.endDate) });
  let recipients = await prisma.user.findMany({ where: { role: "ACCOUNTANT", active: true }, select: { id: true } });
  if (recipients.length === 0) {
    recipients = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { id: true } });
  }
  for (const r of recipients) {
    await notify(
      {
        userId: r.id,
        type: "PAYROLL_PROBLEM_REPORTED",
        message: `${session.user.name ?? "Someone"} reported a problem with their pay for ${label}: ${parsedNote}`,
        entityType: "PayPeriod",
        entityId: start,
      },
      session.user.id
    );
  }

  revalidatePayroll();
}

export async function reportPaymentProblem(id: string, note: string) {
  return toActionResult(() => reportProblemImpl(id, note));
}
