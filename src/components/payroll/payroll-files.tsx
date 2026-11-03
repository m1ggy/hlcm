"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileTypeIcon } from "@/components/files/file-icon";
import { formatBytes } from "@/components/files/format-bytes";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { uploadPayrollAttachment, deletePayrollAttachment } from "@/lib/actions/payroll-attachments";
import type { PayrollFile } from "@/lib/actions/payroll";

/**
 * A list of payroll files with download, plus upload/delete when `canEdit`.
 * Used for a period's own files and for one person's files alike — `target`
 * says which one an upload goes to.
 */
export function PayrollFiles({
  target,
  files,
  canEdit,
  emptyText = "No files yet",
  compact = false,
}: {
  target: { periodStart: string } | { paymentId: string };
  files: PayrollFile[];
  canEdit: boolean;
  emptyText?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return void toast.error("Choose a file to upload");
    setUploading(true);
    startTransition(async () => {
      try {
        const result = await uploadPayrollAttachment(target, formData);
        if (!result.ok) return void toast.error(result.error);
        formRef.current?.reset();
        toast.success("File added");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Upload failed — try again"));
      } finally {
        setUploading(false);
      }
    });
  }

  function handleDelete(id: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This can't be undone.`)) return;
    setDeletingId(id);
    startTransition(async () => {
      try {
        const result = await deletePayrollAttachment(id);
        if (!result.ok) return void toast.error(result.error);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Delete failed — try again"));
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      {canEdit && (
        <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            required
            accept="image/*,.pdf,.csv,.xlsx,.docx"
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
          />
          <Button type="submit" size="sm" loading={uploading}>
            <Upload className="size-3.5" /> Upload
          </Button>
        </form>
      )}

      {files.length === 0 ? (
        <p className={compact ? "text-xs text-muted-foreground" : "py-3 text-center text-sm text-muted-foreground"}>{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div key={file.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border p-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Download"
                  aria-label={`Download ${file.fileName}`}
                  nativeButton={false}
                  render={<a href={`/api/payroll-attachments/${file.id}`} />}
                >
                  <Download className="size-3.5" />
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    aria-label={`Delete ${file.fileName}`}
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
