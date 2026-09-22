"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadFile } from "@/lib/actions/files";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";

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

export function PortalFilePool({
  applicationId,
  files,
  canUpload,
}: {
  applicationId: string;
  files: FileRow[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file to upload");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(fileTooLargeMessage(file.name));
      return;
    }
    startTransition(async () => {
      try {
        const result = await uploadFile(applicationId, formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        formRef.current?.reset();
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Upload failed. Please try again."));
      }
    });
  }

  return (
    <div className="space-y-3">
      {canUpload && (
        <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            required
            className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
          />
          <Button type="submit" size="sm" loading={isPending}>
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
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No files yet
                </TableCell>
              </TableRow>
            )}
            {files.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">{file.fileName}</TableCell>
                <TableCell className="text-muted-foreground">{formatBytes(file.sizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(file.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={<a href={`/api/files/${file.id}`} />}
                  >
                    <Download className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
