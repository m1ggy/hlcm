"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signDocument } from "@/lib/actions/signatures";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PAGE_WIDTH = 560;
const DEFAULT_SIGNATURE_WIDTH_RATIO = 0.25;

type Source = "saved" | "draw" | "upload";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SignPdfDialogContent({
  fileAssetId,
  applicationId,
  fileName,
  hasSavedSignature,
  onOpenChange,
}: {
  fileAssetId: string;
  applicationId: string;
  fileName: string;
  hasSavedSignature: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [source, setSource] = useState<Source>(hasSavedSignature ? "saved" : "draw");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ xRatio: number; yRatio: number } | null>(null);
  const [widthRatio, setWidthRatio] = useState(DEFAULT_SIGNATURE_WIDTH_RATIO);

  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const pdfUrl = useMemo(() => `/api/files/${fileAssetId}`, [fileAssetId]);

  function mountDrawPad(canvas: HTMLCanvasElement | null) {
    if (!canvas || padRef.current) return;
    padRef.current = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
  }

  async function handleUseSaved() {
    const res = await fetch("/api/signatures/profile");
    if (!res.ok) {
      toast.error("No saved signature found");
      return;
    }
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = () => setSignatureImage(reader.result as string);
    reader.readAsDataURL(blob);
  }

  function handleUseDrawn() {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error("Draw a signature first");
      return;
    }
    setSignatureImage(padRef.current.toDataURL("image/png"));
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureImage(await fileToDataUrl(file));
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!signatureImage || !pageWrapperRef.current) return;
    const rect = pageWrapperRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    setPlacement({ xRatio: Math.max(0, Math.min(1, xRatio)), yRatio: Math.max(0, Math.min(1, yRatio)) });
  }

  function handleFinalize() {
    if (!signatureImage || !placement) {
      toast.error("Place your signature on the document first");
      return;
    }
    startTransition(async () => {
      try {
        await signDocument({
          fileAssetId,
          applicationId,
          imageDataUrl: signatureImage,
          pageNumber,
          xRatio: placement.xRatio,
          yRatio: placement.yRatio,
          widthRatio,
        });
        toast.success("Document signed");
        onOpenChange(false);
        setSignatureImage(null);
        setPlacement(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to sign document");
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Sign &ldquo;{fileName}&rdquo;</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <div
            ref={pageWrapperRef}
            onClick={handlePageClick}
            data-testid="pdf-page-wrapper"
            className="relative w-fit cursor-crosshair overflow-hidden rounded border"
          >
            <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={pageNumber} width={PAGE_WIDTH} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
            {signatureImage && placement && (
              // eslint-disable-next-line @next/next/no-img-element -- absolutely-positioned live preview over a canvas, not an optimizable remote asset
              <img
                src={signatureImage}
                alt="Signature placement preview"
                style={{
                  position: "absolute",
                  left: `${placement.xRatio * 100}%`,
                  top: `${placement.yRatio * 100}%`,
                  width: `${widthRatio * 100}%`,
                }}
                className="pointer-events-none border border-dashed border-primary"
              />
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
          <p className="text-xs text-muted-foreground">Click on the page to place your signature.</p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
            {hasSavedSignature && (
              <button
                type="button"
                onClick={() => setSource("saved")}
                className={`flex-1 rounded-md px-2 py-1 ${source === "saved" ? "bg-background shadow-sm" : ""}`}
              >
                Saved
              </button>
            )}
            <button
              type="button"
              onClick={() => setSource("draw")}
              className={`flex-1 rounded-md px-2 py-1 ${source === "draw" ? "bg-background shadow-sm" : ""}`}
            >
              Draw
            </button>
            <button
              type="button"
              onClick={() => setSource("upload")}
              className={`flex-1 rounded-md px-2 py-1 ${source === "upload" ? "bg-background shadow-sm" : ""}`}
            >
              Upload
            </button>
          </div>

          {source === "saved" && (
            <Button size="sm" variant="outline" className="w-full" onClick={handleUseSaved}>
              Use my saved signature
            </Button>
          )}

          {source === "draw" && (
            <div className="space-y-2">
              <canvas
                ref={mountDrawPad}
                data-testid="signature-draw-canvas"
                width={240}
                height={100}
                className="w-full rounded border bg-white"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="xs" onClick={() => padRef.current?.clear()}>
                  Clear
                </Button>
                <Button size="xs" onClick={handleUseDrawn}>
                  Use this
                </Button>
              </div>
            </div>
          )}

          {source === "upload" && (
            <Input type="file" accept="image/png,image/jpeg" onChange={handleUploadChange} />
          )}

          {signatureImage && (
            <div className="space-y-2 rounded-lg border p-2">
              <p className="text-xs text-muted-foreground">Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- transient client-side signature preview, not an optimizable remote asset */}
              <img src={signatureImage} alt="Signature preview" className="h-12 rounded bg-white" />
              <label className="block text-xs text-muted-foreground">
                Size
                <input
                  type="range"
                  min={0.1}
                  max={0.6}
                  step={0.01}
                  value={widthRatio}
                  onChange={(e) => setWidthRatio(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          )}

          <Button className="w-full" onClick={handleFinalize} disabled={isPending || !signatureImage || !placement}>
            {isPending ? "Signing..." : "Finalize Signature"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
