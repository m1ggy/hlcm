import { notFound } from "next/navigation";
import { ForbiddenError } from "@/lib/rbac";
import { requireLibraryAccess } from "@/lib/workspace-library";
import { listLibraryFiles } from "@/lib/actions/files";
import { listFoldersAction } from "@/lib/actions/folders";
import { LIBRARY_ID } from "@/lib/file-folders";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { LibraryFilePool } from "@/components/files/library-file-pool";

// A client workspace's own file library (docs/file-management-plan.md): one
// folder tree for the whole company, separate from the files attached to
// tasks. Office staff and the managing company's team; not caregivers.
export default async function FilesPage() {
  try {
    await requireLibraryAccess();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  const [files, folders] = await Promise.all([listLibraryFiles(), listFoldersAction({ kind: "library", id: LIBRARY_ID })]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Files</h1>
        <PageInfoButton title="Files">
          <p>
            The company&apos;s own documents — policies, HR forms, contracts, templates — in folders. Files attached to a task stay
            on that task.
          </p>
          <p>
            Make folders, drag files and folders around, upload a whole folder from your computer, and replace a file with a new
            version (old versions are kept). Your office staff and the team working with you can see everything here; caregivers
            can&apos;t.
          </p>
        </PageInfoButton>
      </div>
      <LibraryFilePool files={files} folders={folders} />
    </div>
  );
}
