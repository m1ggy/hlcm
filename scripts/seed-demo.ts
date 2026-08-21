// One-off demo-data seeder for handbook screenshots. Additive only — never
// deletes or touches existing rows. Safe to re-run (checks for its own
// marker client name before inserting). Local dev DB only.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@hclm.local" } });

  const alreadySeeded = await prisma.client.findFirst({ where: { name: "Riverbend Senior Living" } });
  if (alreadySeeded) {
    console.log("Demo data already present, skipping.");
    return;
  }

  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  const maria = await prisma.user.create({
    data: { name: "Maria Alvarez", email: "maria@hclm.local", passwordHash, role: "STAFF" },
  });
  const james = await prisma.user.create({
    data: { name: "James Okafor", email: "james@hclm.local", passwordHash, role: "MANAGER" },
  });

  const project = await prisma.project.create({
    data: { name: "2026 Renewals Batch", createdById: admin.id },
  });

  const licenseType = await prisma.licenseTypeTemplate.create({
    data: { name: "CILA", description: "Community Integrated Living Arrangement", createdById: admin.id },
  });
  const caseTypeRenewal = await prisma.caseType.create({
    data: { name: "Renewal", createdById: admin.id },
  });
  const caseTypeNew = await prisma.caseType.create({
    data: { name: "New", createdById: admin.id },
  });

  const clientNames = ["Riverbend Senior Living", "Oakview Group Homes", "Prairie Path Residential"];
  const clients = [];
  for (const name of clientNames) {
    clients.push(
      await prisma.client.create({
        data: {
          name,
          projects: { connect: { id: project.id } },
          contactInfo: "intake@example.com",
          createdById: admin.id,
        },
      })
    );
  }

  const appsSpec: {
    name: string;
    clientIdx: number;
    status: "DRAFT" | "INFO_GATHERING" | "SUBMITTED" | "UNDER_AGENCY_REVIEW" | "NEEDS_REVISION" | "APPROVED";
    assignee: "admin" | "maria" | "james";
  }[] = [
    { name: "Riverbend House 3 — CILA Renewal", clientIdx: 0, status: "UNDER_AGENCY_REVIEW", assignee: "maria" },
    { name: "Riverbend House 5 — CILA Renewal", clientIdx: 0, status: "INFO_GATHERING", assignee: "maria" },
    { name: "Oakview Group Home A — New CILA", clientIdx: 1, status: "NEEDS_REVISION", assignee: "james" },
    { name: "Oakview Group Home B — CILA Renewal", clientIdx: 1, status: "SUBMITTED", assignee: "maria" },
    { name: "Prairie Path Unit 2 — CILA Renewal", clientIdx: 2, status: "APPROVED", assignee: "james" },
    { name: "Prairie Path Unit 4 — New CILA", clientIdx: 2, status: "DRAFT", assignee: "admin" },
  ];
  const userByKey = { admin, maria, james } as const;

  const checklist = [
    { label: "Collect facility floor plan", phase: "Intake" },
    { label: "Verify staff certifications on file", phase: "Intake" },
    { label: "Submit renewal application to IDPH", phase: "Filing" },
    { label: "Schedule agency site visit", phase: "Filing" },
    { label: "Upload fire safety inspection report", phase: "Review" },
    { label: "Client sign-off on final packet", phase: "Review" },
  ];

  for (const spec of appsSpec) {
    const application = await prisma.application.create({
      data: {
        name: spec.name,
        clientId: clients[spec.clientIdx].id,
        status: spec.status,
        licenseTypeTemplateId: licenseType.id,
        caseTypeId: spec.status === "DRAFT" ? caseTypeNew.id : caseTypeRenewal.id,
        assignedUserId: userByKey[spec.assignee].id,
        createdById: admin.id,
      },
    });

    const phaseNames = [...new Set(checklist.map((c) => c.phase))];
    const phaseByName = new Map<string, string>();
    for (const [i, name] of phaseNames.entries()) {
      const phase = await prisma.phase.create({
        data: { applicationId: application.id, name, sortOrder: i },
      });
      phaseByName.set(name, phase.id);
    }

    for (const [i, item] of checklist.entries()) {
      // Vary completion so board/detail screenshots show a realistic mix.
      const progressCut = { DRAFT: 0, INFO_GATHERING: 1, SUBMITTED: 3, UNDER_AGENCY_REVIEW: 4, NEEDS_REVISION: 2, APPROVED: 6 }[
        spec.status
      ];
      const status =
        i < progressCut ? "COMPLETED" : i === progressCut && spec.status === "NEEDS_REVISION" ? "BLOCKED" : i === progressCut ? "IN_PROGRESS" : "NOT_STARTED";
      await prisma.task.create({
        data: {
          applicationId: application.id,
          phaseId: phaseByName.get(item.phase),
          label: item.label,
          status,
          blockedReason: status === "BLOCKED" ? "Waiting on updated fire inspection report from client" : null,
          assignees: { create: [{ userId: userByKey[spec.assignee].id }] },
          reviewers:
            spec.status === "UNDER_AGENCY_REVIEW" ? { create: [{ userId: james.id }] } : undefined,
          dueDate: new Date(Date.now() + (i - 2) * 3 * 24 * 60 * 60 * 1000),
          createdById: admin.id,
          sortOrder: i,
        },
      });
    }

    if (spec.status === "UNDER_AGENCY_REVIEW") {
      const packet = await prisma.fileAsset.create({
        data: {
          applicationId: application.id,
          fileName: "IDPH-CILA-Renewal-Packet.pdf",
          storageKey: "demo/placeholder-1.pdf",
          mimeType: "application/pdf",
          sizeBytes: 482_133,
          uploadedById: maria.id,
        },
      });
      await prisma.fileVersion.create({
        data: {
          fileAssetId: packet.id,
          version: 2,
          generation: BigInt(2),
          fileName: packet.fileName,
          mimeType: packet.mimeType,
          sizeBytes: packet.sizeBytes,
          uploadedById: maria.id,
        },
      });
      await prisma.fileVersion.create({
        data: {
          fileAssetId: packet.id,
          version: 1,
          generation: BigInt(1),
          fileName: "IDPH-CILA-Renewal-Packet-draft.pdf",
          mimeType: "application/pdf",
          sizeBytes: 471_920,
          uploadedById: maria.id,
        },
      });

      const inspection = await prisma.fileAsset.create({
        data: {
          applicationId: application.id,
          fileName: "Fire-Safety-Inspection-2026.pdf",
          storageKey: "demo/placeholder-2.pdf",
          mimeType: "application/pdf",
          sizeBytes: 190_442,
          uploadedById: maria.id,
        },
      });
      await prisma.fileVersion.create({
        data: {
          fileAssetId: inspection.id,
          version: 1,
          generation: BigInt(1),
          fileName: inspection.fileName,
          mimeType: inspection.mimeType,
          sizeBytes: inspection.sizeBytes,
          uploadedById: maria.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          entityType: "Application",
          entityId: application.id,
          field: "status",
          oldValue: "SUBMITTED",
          newValue: "UNDER_AGENCY_REVIEW",
          action: "UPDATE",
          actorId: admin.id,
        },
      });
      await prisma.auditLog.create({
        data: {
          entityType: "Application",
          entityId: application.id,
          field: null,
          oldValue: null,
          newValue: "IDPH-CILA-Renewal-Packet.pdf",
          action: "FILE_UPLOAD",
          actorId: maria.id,
        },
      });
    }
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: "TASK_REVIEW_REQUESTED",
        message: "Maria Alvarez requested your review on \"Submit renewal application to IDPH\"",
        entityType: "Task",
        entityId: "demo",
        read: false,
      },
      {
        userId: admin.id,
        type: "APPLICATION_STATUS_CHANGED",
        message: "Oakview Group Home A — New CILA moved to Needs Revision",
        entityType: "Application",
        entityId: "demo",
        read: false,
      },
      {
        userId: admin.id,
        type: "APPLICATION_SHARED",
        message: "James Okafor shared Prairie Path Unit 2 — CILA Renewal with you",
        entityType: "Application",
        entityId: "demo",
        read: true,
      },
    ],
  });

  await prisma.task.create({
    data: {
      label: "Renew agency portal credentials",
      description: "IDPH portal password expires quarterly — rotate and update the shared vault entry.",
      status: "IN_PROGRESS",
      assignees: { create: [{ userId: admin.id }] },
      reviewers: { create: [{ userId: james.id }] },
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      createdById: admin.id,
    },
  });
  await prisma.task.create({
    data: {
      label: "Monthly file retention cleanup",
      status: "NOT_STARTED",
      assignees: { create: [{ userId: maria.id }] },
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      createdById: admin.id,
    },
  });

  console.log("Demo data seeded: 2 users, 3 clients, 6 applications, checklist tasks, files, notifications, 2 standalone tasks.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
