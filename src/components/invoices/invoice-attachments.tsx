"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileTypeIcon } from "@/components/files/file-icon";
import { formatBytes } from "@/components/files/format-bytes";
import { deleteInvoiceAttachment } from "@/lib/actions/invoice-attachments";
import { useUpload } from "@/components/files/use-upload";
import { UploadProgress } from "@/components/files/upload-progress";
import { pickedFiles, reportBatch } from "@/components/files/report-batch";

// Matches MAX_FILE_BYTES in src/lib/actions/invoice-attachments.ts.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
import { useJustAdded } from "@/components/files/use-just-added";

type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
};

// No versioning or signing here (unlike FilePool/FileInfoDrawer for
// Applications/Tasks) — an invoice attachment is just a supporting document,
// upload/download/delete. Accepted types are enforced server-side in
// uploadInvoiceAttachment (invoice-attachments.ts): images, PDF, .xlsx, .docx.
export function InvoiceAttachments({
  invoiceId,
  attachments,
  canEdit,
}: {
  invoiceId: string;
  attachments: AttachmentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const { status: uploadStatus, uploadMany, cancel: cancelUpload, uploading: isUploading } = useUpload();
  const shown = useJustAdded(attachments);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = pickedFiles(new FormData(e.currentTarget), MAX_ATTACHMENT_BYTES, (f) => `"${f.name}" is larger than 20MB`);
    if (!files) return;
    void uploadMany("invoice", invoiceId, files).then((outcome) => {
      for (const { data } of outcome.uploaded) shown.add(data);
      reportBatch(outcome);
      if (outcome.failed.length === 0) formRef.current?.reset();
      if (outcome.uploaded.length > 0) router.refresh();
    });
  }

  function handleDelete(attachmentId: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This can't be undone.`)) return;
    setDeletingId(attachmentId);
    startTransition(async () => {
      try {
        await deleteInvoiceAttachment(attachmentId, invoiceId);
        shown.remove(attachmentId);
        router.refresh();
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
            multiple
            required
            accept="image/*,.pdf,.xlsx,.docx"
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
          />
          <Button type="submit" size="sm" loading={isUploading}>
            <Upload className="size-3.5" /> Upload
          </Button>
        </form>
      )}
      <UploadProgress status={uploadStatus} onCancel={cancelUpload} />

      {shown.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {shown.rows.map((file) => (
            <div key={file.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileTypeIcon mimeType={file.mimeType} className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatBytes(file.sizeBytes)} · {file.uploadedBy.name} · {new Date(file.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" title="Download" nativeButton={false} render={<a href={`/api/invoice-attachments/${file.id}`} />}>
                  <Download className="size-3.5" />
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    loading={isPending && deletingId === file.id}
                    onClick={() => handleDelete(file.id, file.fileName)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
