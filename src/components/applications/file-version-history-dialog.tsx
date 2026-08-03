"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { History, Download, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listFileVersions, revertFileVersion, uploadNewFileVersion } from "@/lib/actions/files";

type VersionRow = {
  id: string;
  version: number;
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileVersionHistoryDialog({
  fileId,
  fileName,
  canEdit,
  isSigned,
  onReverted,
}: {
  fileId: string;
  fileName: string;
  canEdit: boolean;
  isSigned: boolean;
  onReverted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && versions === null) {
      listFileVersions(fileId)
        .then(setVersions)
        .catch(() => toast.error("Failed to load version history"));
    }
  }

  function handleUploadVersion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file to upload");
      return;
    }
    startTransition(async () => {
      try {
        await uploadNewFileVersion(fileId, formData);
        const refreshed = await listFileVersions(fileId);
        setVersions(refreshed);
        formRef.current?.reset();
        onReverted();
        toast.success("New version uploaded");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    });
  }

  function handleRevert(versionId: string) {
    setRevertingId(versionId);
    startTransition(async () => {
      try {
        await revertFileVersion(fileId, versionId);
        const refreshed = await listFileVersions(fileId);
        setVersions(refreshed);
        onReverted();
        toast.success("Reverted — added as the newest version");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Revert failed");
      } finally {
        setRevertingId(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Version history">
            <History className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Versions — {fileName}</DialogTitle>
        </DialogHeader>

        {isSigned && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            This file has been signed, so its content is locked — no new versions can be added.
          </p>
        )}

        {canEdit && !isSigned && (
          <form ref={formRef} onSubmit={handleUploadVersion} className="flex items-center gap-2">
            <input
              type="file"
              name="file"
              required
              className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            />
            <Button type="submit" size="sm" disabled={isPending}>
              <Upload className="size-3.5" /> New version
            </Button>
          </form>
        )}

        <div className="max-h-80 space-y-1.5 overflow-y-auto">
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
                  render={<a href={`/api/files/${fileId}/versions/${v.id}`} />}
                  title="Download this version"
                >
                  <Download className="size-3.5" />
                </Button>
                {canEdit && !isSigned && i !== 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Revert to this version"
                    disabled={isPending && revertingId === v.id}
                    onClick={() => handleRevert(v.id)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
