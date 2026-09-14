"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createAndSendEnvelopeForApplication, createAndSendEnvelopeForClientAgreement } from "@/lib/actions/docusign-envelopes";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const PAGE_WIDTH = 560;

export type EnvelopeParent = { kind: "application"; applicationId: string } | { kind: "clientAgreement"; clientAgreementId: string };

// Ports only the PDF-preview + click-to-place half of the retired
// SignPdfDialogContent (src/components/applications/sign-pdf-dialog-content.tsx,
// now deleted) — the four signature-source tabs, the draw pad, and the
// width slider are all gone: DocuSign captures the signer's actual
// signature during its own hosted ceremony and auto-sizes its own tab, so
// none of that applies here. What's placed is just a tab POSITION.
export default function SendEnvelopeDialogContent({
  fileAssetId,
  fileName,
  parent,
  onOpenChange,
}: {
  fileAssetId: string;
  fileName: string;
  parent: EnvelopeParent;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [placement, setPlacement] = useState<{ xRatio: number; yRatio: number } | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [expirationDays, setExpirationDays] = useState("30");

  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const pdfUrl = useMemo(() => `/api/files/${fileAssetId}`, [fileAssetId]);

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pageWrapperRef.current) return;
    const rect = pageWrapperRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    setPlacement({ xRatio: Math.max(0, Math.min(1, xRatio)), yRatio: Math.max(0, Math.min(1, yRatio)) });
  }

  function handleSend() {
    if (!placement) {
      toast.error("Click on the page to place the signature first");
      return;
    }
    if (!signerName.trim()) {
      toast.error("Signer name is required");
      return;
    }
    if (!signerEmail.trim()) {
      toast.error("Signer email is required");
      return;
    }
    const days = Number(expirationDays);
    const common = {
      fileAssetId,
      signerName,
      signerEmail,
      pageNumber,
      xRatio: placement.xRatio,
      yRatio: placement.yRatio,
      expirationDays: Number.isFinite(days) && days > 0 ? days : undefined,
    };

    startTransition(async () => {
      try {
        if (parent.kind === "application") {
          await createAndSendEnvelopeForApplication({ applicationId: parent.applicationId, ...common });
        } else {
          await createAndSendEnvelopeForClientAgreement({ clientAgreementId: parent.clientAgreementId, ...common });
        }
        toast.success(`Sent to ${signerEmail}`);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send for signature");
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Send &ldquo;{fileName}&rdquo; for signature</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <div
            ref={pageWrapperRef}
            onClick={handlePageClick}
            className="relative w-fit cursor-crosshair overflow-hidden rounded border"
          >
            <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={pageNumber} width={PAGE_WIDTH} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
            {placement && (
              <div
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded border border-dashed border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                style={{ left: `${placement.xRatio * 100}%`, top: `${placement.yRatio * 100}%` }}
              >
                Sign here
              </div>
            )}
          </div>
          {numPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="xs" onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber === 1}>
                Prev
              </Button>
              <span>
                Page {pageNumber} of {numPages}
              </span>
              <Button variant="outline" size="xs" onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))} disabled={pageNumber === numPages}>
                Next
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Click on the page to place the signature.</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="env-signer-name">Signer name</Label>
            <Input id="env-signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="env-signer-email">Signer email</Label>
            <Input id="env-signer-email" type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="env-expiration">Expires after (days)</Label>
            <Input
              id="env-expiration"
              type="number"
              min={1}
              max={365}
              value={expirationDays}
              onChange={(e) => setExpirationDays(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSend} disabled={!placement} loading={isPending}>
            {isPending ? "Sending..." : "Send for signature"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
