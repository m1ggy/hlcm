"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFile, deleteFile } from "@/lib/actions/files";
import { SignPdfDialog } from "@/components/applications/sign-pdf-dialog";
import { FileCard } from "@/components/files/file-card";
import { FileInfoDrawer } from "@/components/files/file-info-drawer";
import type { FileRow } from "@/components/files/types";

export function FilePool({
  applicationId,
  files,
  canEdit,
  hasSavedSignature,
}: {
  applicationId: string;
  files: FileRow[];
  canEdit: boolean;
  hasSavedSignature: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file to upload");
      return;
    }
    setIsUploading(true);
    startTransition(async () => {
      try {
        await uploadFile(applicationId, formData);
        formRef.current?.reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    });
  }

  function handleDelete(fileId: string) {
    setDeletingId(fileId);
    startTransition(async () => {
      try {
        await deleteFile(fileId, applicationId);
        router.refresh();
        setDrawerOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
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
                <Upload className="size-3.5" /> Upload
              </>
            )}
          </Button>
        </form>
      )}

      {files.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No files yet</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onInfo={() => {
                setActiveFile(file);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <FileInfoDrawer
        file={activeFile}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        canEdit={canEdit}
        isDeleting={isPending && deletingId === activeFile?.id}
        onDelete={() => activeFile && handleDelete(activeFile.id)}
        onChanged={() => router.refresh()}
        signAction={
          canEdit && activeFile && activeFile.mimeType === "application/pdf" && !activeFile.isSigned ? (
            <SignPdfDialog
              fileAssetId={activeFile.id}
              applicationId={applicationId}
              fileName={activeFile.fileName}
              hasSavedSignature={hasSavedSignature}
            />
          ) : undefined
        }
      />
    </div>
  );
}
