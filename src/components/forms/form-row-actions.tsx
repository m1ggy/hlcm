"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink, MoreHorizontal, Pencil, Power, QrCode, Trash2 } from "lucide-react";
import { deleteFormTemplate, duplicateFormTemplate, setFormActive } from "@/lib/actions/form-templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** A form card's actions: copy link, open, QR code, and (managers) edit/duplicate/turn off/delete. */
export function FormRowActions({ id, slug, name, active, canManage, hasSubmissions }: { id: string; slug: string; name: string; active: boolean; canManage: boolean; hasSubmissions: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const url = () => `${window.location.origin}/forms/${slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — open the form and copy its address");
    }
  }

  const run = (fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string, after?: (data: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(done);
      after ? after(r.data) : router.refresh();
    });

  return (
    <div className="mt-auto flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy link"}
      </Button>
      <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/forms/${slug}`} target="_blank" rel="noreferrer" />}>
        <ExternalLink className="size-3.5" /> Open
      </Button>
      <Button variant="ghost" size="sm" onClick={async () => setQr(await QRCode.toDataURL(url(), { width: 512, margin: 2 }))}>
        <QrCode className="size-3.5" /> QR code
      </Button>
      {canManage && (
        <>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/intake/forms/${id}`} />}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`} disabled={pending} />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => run(() => duplicateFormTemplate(id), "Copy made — it's off until you turn it on", (d) => router.push(`/intake/forms/${(d as { id: string }).id}`))}>
                <Copy className="size-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(() => setFormActive(id, !active), active ? "Form turned off" : "Form is live")}>
                <Power className="size-3.5" /> {active ? "Turn off" : "Turn on"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={hasSubmissions}
                onClick={() => window.confirm(`Delete "${name}"? This can't be undone.`) && run(() => deleteFormTemplate(id), "Form deleted")}
              >
                <Trash2 className="size-3.5" /> {hasSubmissions ? "Delete (has submissions — turn off instead)" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <Dialog open={qr !== null} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Print it or put it on a sign: scanning it opens the form.</DialogDescription>
          </DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
              <img src={qr} alt={`QR code for ${name}`} className="size-64 rounded-lg border bg-white p-2" />
              <Button nativeButton={false} render={<a href={qr} download={`${slug}-qr.png`} />}>
                <Download className="size-4" /> Download PNG
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
