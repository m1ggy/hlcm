import { describe, expect, it } from "vitest";
import { computeAgingAlerts, stageRoleForAbbrev, type AgingAlertInput } from "@/lib/aging-alerts";

// Alerts key on PipelineStage.role (3d'), so they keep working however an
// organization names its stages.

const now = new Date("2026-06-01T12:00:00Z");
const base: AgingAlertInput = {
  entityType: "Application",
  stageRole: null,
  daysInStage: null,
  followUpDate: null,
  deficiencyResponseDueDate: null,
  deficiencyResponseSubmittedDate: null,
  recredentialingDueDate: null,
};
const messages = (input: Partial<AgingAlertInput>) => computeAgingAlerts({ ...base, ...input }, now).map((a) => a.message);

describe("aging alerts by stage role", () => {
  it("Supervisor Review over 3 days", () => {
    expect(messages({ stageRole: "SUPERVISOR_REVIEW", daysInStage: 4 })).toEqual([
      "In Supervisor Review for 4 days — flag the Manager.",
    ]);
    expect(messages({ stageRole: "SUPERVISOR_REVIEW", daysInStage: 3 })).toEqual([]);
  });

  it("Waiting on Client Docs over 14 days", () => {
    expect(messages({ stageRole: "WAITING_CLIENT_DOCS", daysInStage: 15 })).toHaveLength(1);
  });

  it("Corrections response due within 7 days, until submitted", () => {
    const due = new Date("2026-06-05T12:00:00Z");
    expect(messages({ stageRole: "CORRECTIONS_RECEIVED", deficiencyResponseDueDate: due })).toEqual([
      "Corrections response due in 4 day(s).",
    ]);
    expect(messages({ stageRole: "CORRECTIONS_RECEIVED", deficiencyResponseDueDate: due, deficiencyResponseSubmittedDate: now })).toEqual([]);
  });

  it("On Hold past its follow-up date", () => {
    expect(messages({ stageRole: "ON_HOLD", followUpDate: new Date("2026-05-01") })).toEqual(["On Hold past its follow-up date."]);
  });

  it("MCO Credentialing Review over 90 days (MCO credentials only)", () => {
    expect(messages({ entityType: "McoCredential", stageRole: "CREDENTIALING_REVIEW", daysInStage: 91 })).toHaveLength(1);
    expect(messages({ entityType: "Application", stageRole: "CREDENTIALING_REVIEW", daysInStage: 91 })).toEqual([]);
  });

  it("a stage with no role never matches a stage rule, whatever its abbrev", () => {
    expect(messages({ stageRole: null, daysInStage: 500, followUpDate: new Date("2020-01-01") })).toEqual([]);
  });
});

describe("stageRoleForAbbrev (the seeded stage list's convention)", () => {
  it("maps the seeded abbrevs", () => {
    expect(stageRoleForAbbrev("HOME_CARE", "SVR")).toBe("SUPERVISOR_REVIEW");
    expect(stageRoleForAbbrev("CILA_GROUP_HOME", "S2 SVR")).toBe("SUPERVISOR_REVIEW");
    expect(stageRoleForAbbrev("CILA_GROUP_HOME", "S1 WCD")).toBe("WAITING_CLIENT_DOCS");
    expect(stageRoleForAbbrev("MCO", "COR")).toBe("CORRECTIONS_RECEIVED");
    expect(stageRoleForAbbrev("HOME_CARE", "HLD")).toBe("ON_HOLD");
    expect(stageRoleForAbbrev("MCO", "CIR")).toBe("CREDENTIALING_REVIEW");
    expect(stageRoleForAbbrev("HOME_CARE", "CIR")).toBeNull();
    expect(stageRoleForAbbrev("HOME_CARE", "RTS")).toBeNull();
  });
});
