"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Paperclip, X } from "lucide-react";
import { sendManualInvoicePdf } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// PDF/XLSX/DOCX extensions for the file picker's own filter — the real
// gate is the MIME whitelist server-side (readExtraAttachments in
// src/lib/actions/invoices.ts), this is just to steer what the OS file
// dialog shows.
const ACCEPT = ".pdf,.xlsx,.docx";

// One-off attachments picked fresh for this single send — nothing here
// is persisted on the invoice, so they need re-attaching next time if
// they should go out again.
export function SendInvoicePdfDialog({ invoiceId, alreadySent }: { invoiceId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);

  const verb = alreadySent ? "Resend" : "Send";

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSend() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("attachments", file));
        await sendManualInvoicePdf(invoiceId, formData);
        toast.success("Invoice PDF sent");
        setOpen(false);
        setFiles([]);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send invoice PDF");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFiles([]);
      }}
    >
      <DialogTrigger render={<Button variant="outline"><Mail className="size-3.5" /> {verb} invoice PDF</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{verb} invoice PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The invoice PDF is attached automatically. Optionally attach anything else — PDF, XLSX, or DOCX.
          </p>

          <div className="space-y-1">
            <Label htmlFor="extra-attachments">Additional attachments (optional)</Label>
            <Input id="extra-attachments" type="file" accept={ACCEPT} multiple onChange={handleFilesChange} />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button onClick={handleSend} className="w-full" disabled={isPending}>
            {isPending ? "Sending..." : `${verb} email`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
