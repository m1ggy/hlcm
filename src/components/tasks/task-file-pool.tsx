"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTaskFile, listTaskFiles } from "@/lib/actions/files";
import { useUpload } from "@/components/files/use-upload";
import { UploadProgress } from "@/components/files/upload-progress";
import { pickedFiles, reportBatch } from "@/components/files/report-batch";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { MAX_FILE_BYTES } from "@/lib/file-limits";
import { FileCard } from "@/components/files/file-card";
import { FileInfoDrawer } from "@/components/files/file-info-drawer";
import type { FileRow } from "@/components/files/types";

export function TaskFilePool({
  taskId,
  files,
  onFilesChange,
}: {
  taskId: string;
  files: FileRow[];
  onFilesChange: (files: FileRow[]) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const { status: uploadStatus, uploadMany, cancel: cancelUpload, uploading: isUploading } = useUpload();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const picked = pickedFiles(new FormData(e.currentTarget), MAX_FILE_BYTES);
    if (!picked) return;
    void uploadMany("task", taskId, picked).then((outcome) => {
      // Newest first, like the list the server sends.
      if (outcome.uploaded.length > 0) onFilesChange([...outcome.uploaded.map((u) => u.data).reverse(), ...files]);
      reportBatch(outcome);
      if (outcome.failed.length === 0) formRef.current?.reset();
    });
  }

  function handleDelete(fileId: string) {
    setDeletingId(fileId);
    startTransition(async () => {
      try {
        const result = await deleteTaskFile(fileId, taskId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onFilesChange(files.filter((f) => f.id !== fileId));
        setDrawerOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Delete failed. Please try again."));
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="file"
          name="file"
          multiple
          required
          className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
        />
        <Button type="submit" size="sm" loading={isUploading}>
          <Upload className="size-3.5" /> Upload
        </Button>
      </form>
      <UploadProgress status={uploadStatus} onCancel={cancelUpload} />

      {files.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No files yet</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        canEdit
        isDeleting={isPending && deletingId === activeFile?.id}
        onDelete={() => activeFile && handleDelete(activeFile.id)}
        onChanged={() => {
          listTaskFiles(taskId).then(onFilesChange);
        }}
      />
    </div>
  );
}
