import { prisma } from "@/lib/prisma";

/**
 * Clones ChecklistItemTemplate rows matching an Application's case type
 * (and license type, if any) into real Phase + Task rows. Templates with no
 * license type are wildcards that clone regardless of the Application's
 * license type. Templates with a phaseName get grouped into a Phase (created
 * on first use, in template sortOrder); templates without one stay flat.
 * No-op if the Application has no caseType or nothing matches — most
 * Applications created without picking a Case Type just start with an empty
 * task list.
 */
export async function cloneChecklistForApplication(params: {
  applicationId: string;
  licenseTypeTemplateId: string | null;
  caseTypeId: string | null;
  assignedUserId: string;
  actorId: string;
}) {
  const { applicationId, licenseTypeTemplateId, caseTypeId, assignedUserId, actorId } = params;
  if (!caseTypeId) return;

  // A template with no license type ("Any" in the admin UI) is a wildcard —
  // it clones onto every Application for that case type regardless of which
  // license type (if any) was picked, in addition to any license-specific match.
  const templates = await prisma.checklistItemTemplate.findMany({
    where: {
      caseTypeId,
      OR: licenseTypeTemplateId
        ? [{ licenseTypeTemplateId }, { licenseTypeTemplateId: null }]
        : [{ licenseTypeTemplateId: null }],
    },
    orderBy: { sortOrder: "asc" },
  });
  if (templates.length === 0) return;

  const phaseIdByName = new Map<string, string>();
  let phaseSortOrder = 0;

  for (const template of templates) {
    let phaseId: string | undefined;
    if (template.phaseName) {
      phaseId = phaseIdByName.get(template.phaseName);
      if (!phaseId) {
        const phase = await prisma.phase.create({
          data: { applicationId, name: template.phaseName, sortOrder: phaseSortOrder++ },
        });
        phaseId = phase.id;
        phaseIdByName.set(template.phaseName, phaseId);
      }
    }

    await prisma.task.create({
      data: {
        applicationId,
        phaseId,
        checklistItemTemplateId: template.id,
        label: template.label,
        description: template.description,
        sortOrder: template.sortOrder,
        assignedUserId,
        createdById: actorId,
      },
    });
  }
}
