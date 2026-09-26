import { db, runAsTenant, type TenantRef } from "@/lib/db";
import { upsertPipelineStages } from "@/lib/pipeline-stage-catalog";
import { defaultPicklists, PICKLIST_KINDS } from "@/lib/picklists";

// Starting data for a brand-new organization (Phase 5's "create org" flow
// calls this right after creating the org and its first OWNER). Kept to
// what the app needs to be usable on day one, and generic on purpose — the
// state-specific setup CTK has (IDPH/IDOA license types, CILA checklists,
// its service-type colors) is each tenant's to add under Admin:
//
// - the pipeline stage catalog (Applications and MCO credentials can't move
//   without it)
// - generic case types
// - default picklists (agencies/payers just "Other"; ball-with = the org
//   itself, Client, Government)
// - a default invoice profile named after the org
//
// Idempotent — safe to re-run against an org that already has some of it.

const DEFAULT_CASE_TYPES = ["New", "Renewal", "Change of Ownership", "Post-License/Ongoing"];

export type SeedOrganizationInput = {
  org: TenantRef & { name: string };
  /** Recorded as createdBy on the seeded rows — the org's first OWNER. */
  ownerId: string;
};

export async function seedOrganization({ org, ownerId }: SeedOrganizationInput) {
  return runAsTenant({ id: org.id, slug: org.slug }, async () => {
    await upsertPipelineStages(ownerId, org.name);

    for (const name of DEFAULT_CASE_TYPES) {
      const existing = await db.caseType.findFirst({ where: { name } });
      if (!existing) await db.caseType.create({ data: { name, createdById: ownerId } });
    }

    const lists = defaultPicklists(org.name);
    await db.picklistOption.createMany({
      data: PICKLIST_KINDS.flatMap((list) =>
        lists[list].map((option, sortOrder) => ({ list, code: option.code, label: option.label, sortOrder }))
      ),
      skipDuplicates: true,
    });

    if ((await db.invoiceProfile.count()) === 0) {
      await db.invoiceProfile.create({ data: { name: org.name, isDefault: true } });
    }
  });
}
