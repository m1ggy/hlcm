"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

// react-pdf/pdfjs is a large dependency for a feature (PDF signing) only
// some files in some applications ever need — deferred so it's fetched
// only once this dialog is actually opened, not on every visit to an
// application's Files tab. Same pattern as CommandPalette's lazy-load.
const SignPdfDialogContent = dynamic(() => import("@/components/applications/sign-pdf-dialog-content"), {
  ssr: false,
});

export function SignPdfDialog({
  fileAssetId,
  applicationId,
  fileName,
  hasSavedSignature,
}: {
  fileAssetId: string;
  applicationId: string;
  fileName: string;
  hasSavedSignature: boolean;
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
          <Button variant="ghost" size="icon-sm" title="Sign">
            <PenLine className="size-3.5" />
          </Button>
        }
      />
      {hasOpened && (
        <SignPdfDialogContent
          fileAssetId={fileAssetId}
          applicationId={applicationId}
          fileName={fileName}
          hasSavedSignature={hasSavedSignature}
          onOpenChange={handleOpenChange}
        />
      )}
    </Dialog>
  );
}
