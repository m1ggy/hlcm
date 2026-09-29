"use client";

import { useState } from "react";
import { Download, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Shows an invoice or receipt PDF inside the app, in the browser's own PDF
// viewer — `href` is the same route the Download button uses, asked for
// inline (see pdfDisposition in src/lib/pdf-templates/options.ts). The
// iframe only mounts while open, so an invoice PDF is regenerated fresh
// each time (picking up edits or a layout switch).
export function PdfPreviewDialog({
  href,
  title,
  size = "default",
  label = "Preview PDF",
}: {
  href: string;
  title: string;
  size?: "default" | "xs";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const inlineHref = `${href}?inline=1`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={size === "xs" ? "ghost" : "outline"} size={size === "xs" ? "xs" : "default"}>
            <Eye className={size === "xs" ? "size-3" : "size-3.5"} /> {label}
          </Button>
        }
      />
      <DialogContent className="flex h-[90dvh] flex-col sm:max-w-4xl">
        <DialogHeader className="flex-row items-center justify-between gap-2 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-1">
            {/* Some mobile browsers only render a PDF's first page in an iframe. */}
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<a href={inlineHref} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink className="size-3.5" /> Open in new tab
            </Button>
            <Button size="sm" variant="ghost" nativeButton={false} render={<a href={href} />}>
              <Download className="size-3.5" /> Download
            </Button>
          </div>
        </DialogHeader>
        {open && <iframe src={inlineHref} title={title} className="min-h-0 w-full flex-1 rounded-md border bg-white" />}
      </DialogContent>
    </Dialog>
  );
}
