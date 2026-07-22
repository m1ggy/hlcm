import { prisma } from "@/lib/prisma";

/**
 * Clones ChecklistItemTemplate rows matching an Application's
 * (licenseTypeTemplateId, caseTypeId) combo into real Phase + Task rows.
 * Templates with a phaseName get grouped into a Phase (created on first
 * use, in template sortOrder); templates without one stay flat. No-op if
 * the Application has no caseType or nothing matches — most Applications
 * created without picking a Case Type just start with an empty task list.
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

  const templates = await prisma.checklistItemTemplate.findMany({
    where: { caseTypeId, licenseTypeTemplateId: licenseTypeTemplateId ?? null },
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
