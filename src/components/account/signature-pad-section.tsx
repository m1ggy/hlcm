"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveSignatureProfile, deleteSignatureProfile } from "@/lib/actions/signatures";

export function SignaturePadSection({ initialImageUrl }: { initialImageUrl: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState(initialImageUrl);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!canvasRef.current) return;
    const pad = new SignaturePad(canvasRef.current, { backgroundColor: "rgb(255,255,255)" });
    padRef.current = pad;
    return () => pad.off();
  }, []);

  function handleClear() {
    padRef.current?.clear();
  }

  function handleSave() {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error("Draw a signature first");
      return;
    }
    const dataUrl = padRef.current.toDataURL("image/png");
    startTransition(async () => {
      try {
        await saveSignatureProfile({ imageDataUrl: dataUrl });
        setSavedImageUrl(`/api/signatures/profile?t=${Date.now()}`);
        toast.success("Signature saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save signature");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteSignatureProfile();
      setSavedImageUrl(null);
      toast.success("Signature removed");
    });
  }

  return (
    <div className="space-y-3">
      {savedImageUrl && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Saved signature:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- signature image is a locally stored data blob, not an optimizable remote asset */}
          <img src={savedImageUrl} alt="Your saved signature" className="h-16 rounded border bg-white" />
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
            Remove signature
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {savedImageUrl ? "Draw a new signature to replace it:" : "Draw your signature:"}
        </p>
        <canvas
          ref={canvasRef}
          data-testid="account-signature-canvas"
          width={400}
          height={150}
          className="rounded border bg-white"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} disabled={isPending}>
            Clear
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            Save Signature
          </Button>
        </div>
      </div>
    </div>
  );
}
