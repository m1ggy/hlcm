"use client";

import { Card, CardContent } from "@/components/ui/card";
import { deleteLibraryFile } from "@/lib/actions/files";
// Type-only: file-folders.ts is server code. "workspace" is its LIBRARY_ID.
import type { FolderRow } from "@/lib/file-folders";
import { FileBrowser } from "@/components/files/file-browser";
import type { FileRow } from "@/components/files/types";

/** The workspace's file library on the Files page. */
export function LibraryFilePool({ files, folders }: { files: FileRow[]; folders: FolderRow[] }) {
  return (
    <Card>
      <CardContent>
        <FileBrowser
          owner={{ kind: "library", id: "workspace" }}
          folders={folders}
          files={files}
          canEdit
          onDeleteFile={(fileId) => deleteLibraryFile(fileId)}
          emptyText="No files yet. Upload one, or make a folder to start."
        />
      </CardContent>
    </Card>
  );
}
