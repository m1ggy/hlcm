import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Where a Task notification (bell, pop-up and email) leads: the task's own
// place with its detail dialog open (?task=, read by TaskDetailDialog).
// Checklist tasks live on their application's page; everything else
// (internal errands, lead follow-ups) on My Tasks. A subtask opens its
// parent, the row that's always on screen. The target page does its own
// access checks; a task that's gone (or not in this workspace) just lands
// on My Tasks. Caregivers always go to My Tasks.
export default async function TaskLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id },
    select: { id: true, applicationId: true, parentTask: { select: { id: true, applicationId: true } } },
  });
  if (!task) redirect("/tasks");
  const open = task.parentTask?.id ?? task.id;
  const applicationId = task.applicationId ?? task.parentTask?.applicationId;
  // Caregivers can't open applications; their tasks are all on My Tasks.
  const isCaregiver = (await auth())?.user?.role === "CAREGIVER";
  redirect(applicationId && !isCaregiver ? `/applications/${applicationId}?task=${open}` : `/tasks?task=${open}`);
}
