import { redirect } from "next/navigation";

// The inbox moved to /intake (docs/forms-plan.md); old links and bookmarks still work.
export default async function OldSubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  redirect(status ? `/intake?status=${encodeURIComponent(status)}` : "/intake");
}
