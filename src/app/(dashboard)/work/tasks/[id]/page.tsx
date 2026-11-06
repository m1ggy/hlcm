import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkViewer } from "@/lib/work-session";
import { taskWhere } from "@/lib/work";

// A link to one task (notifications, emails): opens its project with the
// task panel showing.
export default async function WorkTaskLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { scope } = await requireWorkViewer();
  const task = await db.workTask.findFirst({ where: { id, ...taskWhere(scope) }, select: { projectId: true } });
  if (!task) notFound();
  redirect(`/work/projects/${task.projectId}?task=${id}`);
}
