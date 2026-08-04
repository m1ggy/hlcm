"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listFileVersions, revertFileVersion, uploadNewFileVersion } from "@/lib/actions/files";
import { formatBytes } from "./format-bytes";
import type { FileRow } from "./types";

type VersionRow = {
  id: string;
  version: number;
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
};

// One drawer instance per pool, opened against whichever file was clicked.
// `file` stays populated after close (only `open` flips) so the closing
// transition doesn't flash empty content.
export function FileInfoDrawer({
  file,
  open,
  onOpenChange,
  canEdit,
  isDeleting,
  onDelete,
  onChanged,
  signAction,
}: {
  file: FileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onChanged: () => void;
  signAction?: React.ReactNode;
}) {
  const [versionsState, setVersionsState] = useState<{ fileId: string; rows: VersionRow[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const fileId = file?.id ?? null;
  // Keyed by fileId so switching files never flashes the previous file's
  // version list — a mismatch just reads as "still loading".
  const versions = fileId && versionsState?.fileId === fileId ? versionsState.rows : null;

  useEffect(() => {
    if (!open || !fileId) return;
    listFileVersions(fileId)
      .then((rows) => setVersionsState({ fileId, rows }))
      .catch(() => toast.error("Failed to load version history"));
  }, [open, fileId]);

  function handleUploadVersion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData(e.currentTarget);
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File) || uploaded.size === 0) {
      toast.error("Choose a file to upload");
      return;
    }
    setIsUploading(true);
    startTransition(async () => {
      try {
        await uploadNewFileVersion(file.id, formData);
        const refreshed = await listFileVersions(file.id);
        setVersionsState({ fileId: file.id, rows: refreshed });
        formRef.current?.reset();
        onChanged();
        toast.success("New version uploaded");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    });
  }

  function handleRevert(versionId: string) {
    if (!file) return;
    setRevertingId(versionId);
    startTransition(async () => {
      try {
        await revertFileVersion(file.id, versionId);
        const refreshed = await listFileVersions(file.id);
        setVersionsState({ fileId: file.id, rows: refreshed });
        onChanged();
        toast.success("Reverted — added as the newest version");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Revert failed");
      } finally {
        setRevertingId(null);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="pb-0">
          <SheetTitle className="truncate pr-6">{file?.fileName ?? "File"}</SheetTitle>
          {file && (
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.sizeBytes)} · {file.uploadedBy.name} · {new Date(file.createdAt).toLocaleString()}
            </p>
          )}
        </SheetHeader>

        {file && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/files/${file.id}`} />}>
                <Download className="size-3.5" /> Download
              </Button>
              {signAction}
              {canEdit && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => {
                    if (confirm(`Delete "${file.fileName}"? This can't be undone.`)) onDelete();
                  }}
                >
                  {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete
                </Button>
              )}
            </div>

            {file.isSigned && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                This file has been signed, so its content is locked — no new versions can be added.
              </p>
            )}

            {canEdit && !file.isSigned && (
              <form ref={formRef} onSubmit={handleUploadVersion} className="flex items-center gap-2">
                <input
                  type="file"
                  name="file"
                  required
                  className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
                />
                <Button type="submit" size="sm" disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" /> New version
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Version history</p>
              {versions === null && <p className="text-sm text-muted-foreground">Loading...</p>}
              {versions?.length === 0 && <p className="text-sm text-muted-foreground">No versions found.</p>}
              {versions?.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">v{v.version}</span>
                      {i === 0 && (
                        <Badge variant="outline" className="text-[0.65rem]">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.uploadedBy.name} · {new Date(v.createdAt).toLocaleString()} · {formatBytes(v.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      nativeButton={false}
                      render={<a href={`/api/files/${file.id}/versions/${v.id}`} />}
                      title="Download this version"
                    >
                      <Download className="size-3.5" />
                    </Button>
                    {canEdit && !file.isSigned && i !== 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Revert to this version"
                        disabled={isPending && revertingId === v.id}
                        onClick={() => handleRevert(v.id)}
                      >
                        {isPending && revertingId === v.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
