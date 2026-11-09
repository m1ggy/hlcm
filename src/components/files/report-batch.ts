"use client";

import { toast } from "sonner";
import { fileTooLargeMessage } from "@/lib/file-limits";
import type { BatchOutcome } from "@/components/files/use-upload";
import type { UploadTarget } from "@/lib/upload-targets";

/**
 * The non-empty files picked in a form's file input. Shows a toast and
 * returns null when there are none, or when one is over `maxBytes` — the
 * whole pick is refused then, so nobody wonders which ones went up.
 */
export function pickedFiles(form: FormData, maxBytes: number, tooLarge?: (file: File) => string): File[] | null {
  const files = form.getAll("file").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) {
    toast.error("Choose a file to upload");
    return null;
  }
  const big = files.find((f) => f.size > maxBytes);
  if (big) {
    toast.error(tooLarge ? tooLarge(big) : fileTooLargeMessage(big.name));
    return null;
  }
  return files;
}

/** One toast for a batch: what failed (by name), or how many went up. */
export function reportBatch<K extends UploadTarget>(outcome: BatchOutcome<K>) {
  const { uploaded, failed, cancelled } = outcome;
  if (failed.length === 1) {
    toast.error(`${failed[0].file.name} didn't upload`, { description: failed[0].error });
  } else if (failed.length > 1) {
    toast.error(`${failed.length} files didn't upload`, {
      description: failed.map((f) => `${f.file.name}: ${f.error}`).join("; "),
    });
  }
  if (cancelled) toast.message(uploaded.length > 0 ? `Upload stopped after ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}` : "Upload cancelled");
  else if (uploaded.length > 1) toast.success(`${uploaded.length} files uploaded`);
}
