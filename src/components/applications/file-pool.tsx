"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadFile, deleteFile } from "@/lib/actions/files";

type FileRow = {
  id: string;
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

export function FilePool({
  applicationId,
  files,
  canEdit,
}: {
  applicationId: string;
  files: FileRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file to upload");
      return;
    }
    startTransition(async () => {
      try {
        await uploadFile(applicationId, formData);
        formRef.current?.reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    });
  }

  function handleDelete(fileId: string) {
    setDeletingId(fileId);
    startTransition(async () => {
      try {
        await deleteFile(fileId, applicationId);
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
            required
            className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
          />
          <Button type="submit" size="sm" disabled={isPending}>
            <Upload className="size-3.5" /> Upload
          </Button>
        </form>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No files yet
                </TableCell>
              </TableRow>
            )}
            {files.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">{file.fileName}</TableCell>
                <TableCell className="text-muted-foreground">{formatBytes(file.sizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground">{file.uploadedBy.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(file.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" render={<a href={`/api/files/${file.id}`} />}>
                      <Download className="size-3.5" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isPending && deletingId === file.id}
                        onClick={() => handleDelete(file.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
