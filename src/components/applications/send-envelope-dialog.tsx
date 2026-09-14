"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import type { EnvelopeParent } from "./send-envelope-dialog-content";

// react-pdf/pdfjs is a large dependency for a feature only some files ever
// need — deferred so it's fetched only once this dialog is actually
// opened, not on every visit to a Files tab. Same pattern the retired
// SignPdfDialog used for the same reason.
const SendEnvelopeDialogContent = dynamic(() => import("@/components/applications/send-envelope-dialog-content"), {
  ssr: false,
});

export function SendEnvelopeDialog({
  fileAssetId,
  fileName,
  parent,
}: {
  fileAssetId: string;
  fileName: string;
  parent: EnvelopeParent;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setHasOpened(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="Send for signature">
            <FileSignature className="size-3.5" /> Send for signature
          </Button>
        }
      />
      {hasOpened && (
        <SendEnvelopeDialogContent fileAssetId={fileAssetId} fileName={fileName} parent={parent} onOpenChange={handleOpenChange} />
      )}
    </Dialog>
  );
}
