"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteFile } from "@/lib/actions/files";
import { useUpload } from "@/components/files/use-upload";
import { UploadProgress } from "@/components/files/upload-progress";
import { pickedFiles, reportBatch } from "@/components/files/report-batch";
import { useJustAdded } from "@/components/files/use-just-added";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { MAX_FILE_BYTES } from "@/lib/file-limits";
import { SendEnvelopeDialog } from "@/components/applications/send-envelope-dialog";
import { EnvelopeStatusList, type EnvelopeRow } from "@/components/applications/envelope-status-list";
import { FileCard } from "@/components/files/file-card";
import { FileInfoDrawer } from "@/components/files/file-info-drawer";
import type { FileRow } from "@/components/files/types";

export function FilePool({
  applicationId,
  files,
  envelopes,
  canEdit,
}: {
  applicationId: string;
  files: FileRow[];
  envelopes: EnvelopeRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const { status: uploadStatus, uploadMany, cancel: cancelUpload, uploading: isUploading } = useUpload();
  const shown = useJustAdded(files);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = pickedFiles(new FormData(e.currentTarget), MAX_FILE_BYTES);
    if (!files) return;
    void uploadMany("application", applicationId, files).then((outcome) => {
      for (const { data } of outcome.uploaded) shown.add(data);
      reportBatch(outcome);
      if (outcome.failed.length === 0) formRef.current?.reset();
      if (outcome.uploaded.length > 0) router.refresh();
    });
  }

  function handleDelete(fileId: string) {
    setDeletingId(fileId);
    startTransition(async () => {
      try {
        const result = await deleteFile(fileId, applicationId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        shown.remove(fileId);
        router.refresh();
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
      {canEdit && (
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
      )}
      <UploadProgress status={uploadStatus} onCancel={cancelUpload} />

      <EnvelopeStatusList envelopes={envelopes} canEdit={canEdit} />

      {shown.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No files yet</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.rows.map((file) => (
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
            <SendEnvelopeDialog
              fileAssetId={activeFile.id}
              fileName={activeFile.fileName}
              parent={{ kind: "application", applicationId }}
            />
          ) : undefined
        }
      />
    </div>
  );
}
