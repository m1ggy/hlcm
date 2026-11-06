import { db } from "@/lib/db";

// A new client workspace's first project (docs/workspace-tasks-plan.md,
// Phase 4): a few first steps for the client, instead of the licensing
// template a full workspace is copied from.
//
// Written straight to the tables, without activity rows, so the starter
// tasks don't show up as "new" in the first weekly summary or its email.
// Runs inside the new workspace's tenant scope (runAsTenant).

export const STARTER_PROJECT_NAME = "Getting started";

const STARTER_TASKS: { title: string; description: string }[] = [
  {
    title: "Invite your team",
    description:
      "Add the people at your company who should follow this work: Users, then Invite. The staff working for you are added by your managing company — you don't need to invite them.",
  },
  {
    title: "Tell us what you need first",
    description:
      'On the Projects page, use "Request a task" for anything you want done. Your team picks it up and you can follow it here, with comments and files.',
  },
  {
    title: "Look at your weekly summary",
    description:
      '"This week" in the sidebar shows what was done each day, any week back. Every Monday morning you also get last week\'s summary by email.',
  },
  {
    title: "Kick-off call",
    description: "Your account manager sets this up to agree on priorities and how you'd like to hear from us.",
  },
];

/** Creates the starter project unless the workspace already has projects. Returns its id, or null. */
export async function createStarterProject(createdById: string): Promise<string | null> {
  if ((await db.workProject.count()) > 0) return null;
  const project = await db.workProject.create({
    data: {
      name: STARTER_PROJECT_NAME,
      description: "A few first steps while your team gets set up.",
      color: "blue",
      createdById,
    },
    select: { id: true },
  });
  await db.workTask.createMany({
    data: STARTER_TASKS.map((t, i) => ({ projectId: project.id, title: t.title, description: t.description, sortOrder: i, createdById })),
  });
  return project.id;
}
