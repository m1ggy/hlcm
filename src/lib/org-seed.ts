import { db, runAsTenant, tenantDb, type TenantRef } from "@/lib/db";
import { getOrgBySlug } from "@/lib/tenant";
import { upsertPipelineStages } from "@/lib/pipeline-stage-catalog";
import { defaultPicklists, PICKLIST_KINDS, type PicklistKind } from "@/lib/picklists";

// Starting data for a brand-new organization (Phase 5's "create org" flow
// calls this right after creating the org and its first OWNER).
//
// A new tenant starts from a copy of the *template organization*'s current
// setup — CTK by default (TEMPLATE_ORG_SLUG) — so it gets the same license
// types, case types, checklist templates, service types and agency / payer /
// ball-with lists CTK uses today, and later edits to CTK's setup carry over
// to tenants created afterwards. Everything copied is the tenant's own from
// then on (editing it never touches CTK's). Without a template org (fresh
// install) it falls back to a small generic set.
//
// Always seeded regardless: the pipeline stage catalog ("CTK" in stage names
// becomes the org's name) and a default invoice profile named after the org.
// Not copied: document templates (they carry uploaded .docx files), forms,
// invoice profiles, and anything that's data rather than setup.
//
// Idempotent — safe to re-run against an org that already has some of it.

const DEFAULT_CASE_TYPES = ["New", "Renewal", "Change of Ownership", "Post-License/Ongoing"];

export type SeedOrganizationInput = {
  org: TenantRef & { name: string };
  /** Recorded as createdBy on the seeded rows — the org's first OWNER. */
  ownerId: string;
  /** Org whose setup is copied; null for the generic set. Default: TEMPLATE_ORG_SLUG or "ctk". */
  templateOrgSlug?: string | null;
};

type PicklistSeed = { list: PicklistKind; code: string; label: string; sortOrder: number };

export async function seedOrganization({ org, ownerId, templateOrgSlug }: SeedOrganizationInput) {
  const slug = templateOrgSlug === undefined ? (process.env.TEMPLATE_ORG_SLUG ?? "ctk") : templateOrgSlug;
  const template = slug ? await getOrgBySlug(slug) : null;
  const copyFrom = template && template.id !== org.id ? template : null;

  // Read the template's setup up front, through its own tenant scope.
  const source = copyFrom ? await readTemplate(copyFrom.id) : null;

  return runAsTenant({ id: org.id, slug: org.slug }, async () => {
    await upsertPipelineStages(ownerId, org.name);

    // License types and case types (matched by name; no unique key).
    const licenseTypeIds = new Map<string, string>(); // template id -> new id
    for (const lt of source?.licenseTypes ?? []) {
      const existing = await db.licenseTypeTemplate.findFirst({ where: { name: lt.name } });
      const row = existing ?? (await db.licenseTypeTemplate.create({ data: { name: lt.name, description: lt.description, createdById: ownerId } }));
      licenseTypeIds.set(lt.id, row.id);
    }
    const caseTypeIds = new Map<string, string>();
    const caseTypes = source?.caseTypes ?? DEFAULT_CASE_TYPES.map((name) => ({ id: name, name, description: null }));
    for (const ct of caseTypes) {
      const existing = await db.caseType.findFirst({ where: { name: ct.name } });
      const row = existing ?? (await db.caseType.create({ data: { name: ct.name, description: ct.description, createdById: ownerId } }));
      caseTypeIds.set(ct.id, row.id);
    }

    // Checklist templates: no natural key to dedupe on, so only when the org has none yet.
    if (source && (await db.checklistItemTemplate.count()) === 0) {
      for (const item of source.checklistItems) {
        const caseTypeId = caseTypeIds.get(item.caseTypeId);
        const licenseTypeTemplateId = item.licenseTypeTemplateId ? licenseTypeIds.get(item.licenseTypeTemplateId) : null;
        // Points at a retired license/case type in the template — skip rather than guess.
        if (!caseTypeId || licenseTypeTemplateId === undefined) continue;
        await db.checklistItemTemplate.create({
          data: {
            caseTypeId,
            licenseTypeTemplateId,
            label: item.label,
            description: item.description,
            defaultRole: item.defaultRole,
            phaseName: item.phaseName,
            sortOrder: item.sortOrder,
            createdById: ownerId,
          },
        });
      }
    }

    for (const st of source?.serviceTypes ?? []) {
      await db.serviceType.createMany({
        data: [{ name: st.name, hex: st.hex, textColor: st.textColor, createdById: ownerId }],
        skipDuplicates: true,
      });
    }

    await db.picklistOption.createMany({ data: picklistSeed(org.name, copyFrom?.name ?? null, source?.picklists ?? null), skipDuplicates: true });

    if ((await db.invoiceProfile.count()) === 0) {
      await db.invoiceProfile.create({ data: { name: org.name, isDefault: true } });
    }
  });
}

async function readTemplate(templateId: string) {
  const t = tenantDb(templateId);
  const [licenseTypes, caseTypes, checklistItems, serviceTypes, picklists] = await Promise.all([
    t.licenseTypeTemplate.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    t.caseType.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    t.checklistItemTemplate.findMany({ orderBy: [{ caseTypeId: "asc" }, { sortOrder: "asc" }] }),
    t.serviceType.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    t.picklistOption.findMany({ where: { active: true }, orderBy: [{ list: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return { licenseTypes, caseTypes, checklistItems, serviceTypes, picklists };
}

// The template's lists as-is — except the ball-with option that *is* the
// template org ("CTK"), which becomes the new org ("the ball is with us").
function picklistSeed(orgName: string, templateName: string | null, templateOptions: PicklistSeed[] | null): PicklistSeed[] {
  if (!templateOptions) {
    const lists = defaultPicklists(orgName);
    return PICKLIST_KINDS.flatMap((list) => lists[list].map((o, sortOrder) => ({ list, code: o.code, label: o.label, sortOrder })));
  }
  return templateOptions.map(({ list, code, label, sortOrder }) =>
    list === "BALL_WITH" && label === templateName ? { list, code: "US", label: orgName, sortOrder } : { list, code, label, sortOrder }
  );
}
