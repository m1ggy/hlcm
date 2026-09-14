"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listClientFiles, uploadClientFile } from "@/lib/actions/files";

// Same deferred-import reasoning as send-envelope-dialog.tsx — react-pdf/
// pdfjs only needs fetching once a send actually starts.
const SendEnvelopeDialogContent = dynamic(() => import("@/components/applications/send-envelope-dialog-content"), {
  ssr: false,
});

// Unlike an Application's Files tab, a Client agreement has no existing
// FileAsset to point at (ClientAgreement itself stores no file — see
// prisma/schema.prisma) — this is the "no existing file to pick from" case
// the send flow needs a first step for: pick one of the client's own PDFs,
// or upload a fresh one, before the shared placement/signer step.
export function SendAgreementEnvelopeDialog({ clientId, clientAgreementId }: { clientId: string; clientAgreementId: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "sending">("choose");
  const [files, setFiles] = useState<{ id: string; fileName: string }[] | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!open || files !== null) return;
    listClientFiles(clientId)
      .then((rows) => setFiles(rows.filter((f) => f.mimeType === "application/pdf").map((f) => ({ id: f.id, fileName: f.fileName }))))
      .catch(() => toast.error("Failed to load client files"));
  }, [open, clientId, files]);

  function reset() {
    setStep("choose");
    setSelectedFileId(null);
    setSelectedFileName("");
  }

  function handlePickExisting(id: string) {
    const file = files?.find((f) => f.id === id);
    if (!file) return;
    setSelectedFileId(file.id);
    setSelectedFileName(file.fileName);
    setStep("sending");
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a PDF to upload");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files can be sent for signature");
      return;
    }
    setIsUploading(true);
    uploadClientFile(clientId, formData)
      .then((asset) => {
        setSelectedFileId(asset.id);
        setSelectedFileName(asset.fileName);
        setStep("sending");
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Upload failed"))
      .finally(() => setIsUploading(false));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm">Send for signature</Button>} />
      {step === "choose" ? (
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send agreement for signature</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {files && files.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Pick an existing PDF from this client&apos;s files</p>
                <SearchableSelect
                  items={Object.fromEntries(files.map((f) => [f.id, f.fileName]))}
                  value={null}
                  onValueChange={(v) => v && handlePickExisting(v)}
                  searchPlaceholder="Search files..."
                />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{files && files.length > 0 ? "Or upload a new one" : "Upload a PDF to send"}</p>
              <form onSubmit={handleUpload} className="flex items-center gap-2">
                <input
                  type="file"
                  name="file"
                  accept="application/pdf"
                  required
                  className="h-8 flex-1 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
                />
                <Button type="submit" size="sm" loading={isUploading}>
                  Upload
                </Button>
              </form>
            </div>
          </div>
        </DialogContent>
      ) : (
        selectedFileId && (
          <SendEnvelopeDialogContent
            fileAssetId={selectedFileId}
            fileName={selectedFileName}
            parent={{ kind: "clientAgreement", clientAgreementId }}
            onOpenChange={setOpen}
          />
        )
      )}
    </Dialog>
  );
}
