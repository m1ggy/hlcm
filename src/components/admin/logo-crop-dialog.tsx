"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// A sensible starting box (90% of the image, centered) rather than either
// the full image or an empty crop — gives the user something to nudge
// inward right away instead of having to draw a box from scratch.
function defaultCrop(width: number, height: number): Crop {
  return centerCrop(makeAspectCrop({ unit: "%", width: 90 }, width / height, width, height), width, height);
}

// Extracts the selected region as a same-format Blob (PNG stays PNG —
// preserving transparency — JPEG stays JPEG), at the crop's true pixel
// size rather than its on-screen display size. `crop` is in on-screen
// pixel coordinates (from ReactCrop's onComplete with unit="px"); the
// scaleX/scaleY conversion maps that back to the image's natural
// resolution, the standard react-image-crop extraction pattern.
function cropToBlob(image: HTMLImageElement, crop: PixelCrop, mimeType: string): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scaleX));
  canvas.height = Math.max(1, Math.round(crop.height * scaleY));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser");
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to crop image"))), mimeType, 0.95);
  });
}

// Lets an admin trim the empty space around a just-picked logo file before
// it's uploaded — freeform crop (no fixed aspect), since a wordmark and a
// square icon need very different shapes. `onConfirm` gets back a File with
// the same name/type as the original, just cropped; "Use full image" skips
// cropping entirely and passes the original file through unchanged, so this
// is purely an optional step, never a blocker to uploading as-is.
export function LogoCropDialog({
  file,
  onConfirm,
  onCancel,
}: {
  file: File | null;
  onConfirm: (cropped: File) => void;
  onCancel: () => void;
}) {
  // Derived from `file` during render (not via setState-in-an-effect) —
  // the only actual side effect needed is revoking the URL once it's
  // superseded or the dialog closes, which the effect below handles.
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Fires on every new image (including a re-pick after cancelling), so
  // this is also what resets `crop`/`completedCrop` for the new file —
  // no separate reset-on-file-change effect needed.
  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCompletedCrop(undefined);
    setCrop(defaultCrop(width, height));
  }

  async function handleUseFullImage() {
    if (!file) return;
    onConfirm(file);
  }

  async function handleCropConfirm() {
    if (!file || !imgRef.current || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
      onConfirm(file!);
      return;
    }
    setIsCropping(true);
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop, file.type);
      onConfirm(new File([blob], file.name, { type: file.type }));
    } finally {
      setIsCropping(false);
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop logo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Drag the corners to trim empty space around the logo, or leave it as-is.
          </p>
          {objectUrl && (
            <div className="flex justify-center rounded border border-border bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                className="max-h-[60vh]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    locally-picked File via object URL, not an app asset;
                    next/image can't take a blob: URL. */}
                <img ref={imgRef} src={objectUrl} alt="Logo to crop" onLoad={handleImageLoad} className="max-h-[60vh]" />
              </ReactCrop>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={isCropping}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleUseFullImage} disabled={isCropping}>
              Use full image
            </Button>
            <Button onClick={handleCropConfirm} disabled={isCropping}>
              {isCropping ? "Cropping..." : "Crop & continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
