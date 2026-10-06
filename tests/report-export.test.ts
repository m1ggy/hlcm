import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { exportResponse } from "@/lib/report-export";

// Exports say which workspace they're from, and are dated in its timezone
// rather than the server's.

const ORG = { id: "org_reports", slug: "reports-co" };

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG.id },
    create: { ...ORG, name: "Sunrise Home Care", timezone: "Pacific/Auckland" },
    update: { name: "Sunrise Home Care", timezone: "Pacific/Auckland" },
  });
  forgetOrg(ORG.slug);
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.$disconnect();
});

describe("report exports", () => {
  it("carry the workspace name and the date in the workspace's timezone", async () => {
    // 11pm UTC on Oct 5 is already Oct 6 in Auckland.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T23:00:00Z"));
    const res = await runAsTenant(ORG, () =>
      exportResponse({ title: "Client report", sections: [{ title: "Clients", columns: [{ label: "Name" }], rows: [["Acme"]] }] }, "csv")
    );
    vi.useRealTimers();
    const csv = await res.text();
    expect(csv.split("\n").slice(0, 2)).toEqual(["Client report", "Sunrise Home Care · Generated 10/6/2026"]);
  });
});
