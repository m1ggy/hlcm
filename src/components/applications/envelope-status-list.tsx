"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnvelopeStatusBadge } from "@/components/files/envelope-status-badge";
import { voidEnvelope } from "@/lib/actions/docusign-envelopes";
import type { $Enums } from "@/generated/prisma/client";

export type EnvelopeRow = {
  id: string;
  status: $Enums.DocusignEnvelopeStatus;
  signerName: string;
  signerEmail: string;
  sentAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  completedFileAssetId: string | null;
};

// Every envelope ever sent for this parent (Application or, via the same
// component, a Client agreement) — not just outstanding ones, so a past
// decline/void stays visible as history, same "nothing hidden" spirit as
// the file-version history panel.
export function EnvelopeStatusList({ envelopes, canEdit }: { envelopes: EnvelopeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [voidingId, setVoidingId] = useState<string | null>(null);

  if (envelopes.length === 0) return null;

  function handleVoid(id: string) {
    const reason = prompt("Reason for voiding this envelope?");
    if (reason === null) return;
    setVoidingId(id);
    startTransition(async () => {
      try {
        await voidEnvelope(id, reason || "Voided by staff");
        toast.success("Envelope voided");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to void");
      } finally {
        setVoidingId(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Sent for signature</p>
      {envelopes.map((envelope) => (
        <div key={envelope.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {envelope.signerName} <span className="font-normal text-muted-foreground">({envelope.signerEmail})</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {envelope.sentAt && `Sent ${new Date(envelope.sentAt).toLocaleDateString()}`}
              {envelope.completedAt && ` · Signed ${new Date(envelope.completedAt).toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EnvelopeStatusBadge status={envelope.status} expiresAt={envelope.expiresAt} />
            {envelope.completedFileAssetId && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Download signed document"
                nativeButton={false}
                render={<a href={`/api/files/${envelope.completedFileAssetId}`} />}
              >
                <Download className="size-3.5" />
              </Button>
            )}
            {canEdit && (envelope.status === "SENT" || envelope.status === "DELIVERED") && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Void"
                loading={isPending && voidingId === envelope.id}
                onClick={() => handleVoid(envelope.id)}
              >
                <Ban className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
