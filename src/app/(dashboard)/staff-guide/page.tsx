import { readFile } from "fs/promises";
import path from "path";
import { notFound } from "next/navigation";
import { blockCaregiverRoute, requireSession } from "@/lib/rbac";
import { currentOrganization } from "@/lib/db";
import { MarkdownView, markdownOutline } from "@/components/shared/markdown-view";

// The staff guide to client workspaces, tasks and the end-of-day report.
// Its text is docs/staff-guide.md (bundled with this page through
// outputFileTracingIncludes in next.config.ts); its screenshots are in
// public/staff-guide/. For our own people only: not caregivers, and not a
// client's people in their tasks workspace.
export default async function StaffGuidePage() {
  await blockCaregiverRoute();
  const [session, org] = await Promise.all([requireSession(), currentOrganization()]);
  if (org.kind === "TASKS" && !session.user.isAssigned) notFound();

  const source = await readFile(path.join(process.cwd(), "docs", "staff-guide.md"), "utf8");
  const outline = markdownOutline(source);

  return (
    <div className="grid gap-10 xl:grid-cols-[1fr_14rem]">
      <div className="min-w-0 max-w-3xl">
        <MarkdownView source={source} />
      </div>
      <nav aria-label="On this page" className="hidden xl:block">
        <div className="sticky top-20 space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
          {outline.map((h) => (
            <a key={h.id} href={`#${h.id}`} className="block text-muted-foreground hover:text-foreground">
              {h.text}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
