"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Files the browser can show in place (/api/files/<id>?inline=1 serves only
// these inline; see INLINE_TYPES there).
const PREVIEW_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export function canPreview(mimeType: string) {
  return PREVIEW_TYPES.has(mimeType);
}

/** A PDF or picture, shown large over the page, with Download and Open in new tab. */
export function FilePreviewDialog({
  file,
  open,
  onOpenChange,
}: {
  file: { id: string; fileName: string; mimeType: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const src = file ? `/api/files/${file.id}?inline=1` : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader className="flex-row flex-wrap items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 flex-1 truncate">{file?.fileName ?? "File"}</DialogTitle>
          {file && (
            <>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={src} target="_blank" rel="noopener" />}>
                <ExternalLink className="size-3.5" /> Open in new tab
              </Button>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/files/${file.id}`} />}>
                <Download className="size-3.5" /> Download
              </Button>
            </>
          )}
        </DialogHeader>
        {file && open && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted">
            {file.mimeType === "application/pdf" ? (
              <iframe src={src} title={file.fileName} className="size-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- an authenticated file route, not a static asset
              <img src={src} alt={file.fileName} className="size-full object-contain" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
