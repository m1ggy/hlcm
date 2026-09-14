import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { verifyDocusignWebhookSignature, downloadCompletedDocument, DocusignWebhookError, DocusignConfigError } from "@/lib/docusign";
import { saveBuffer } from "@/lib/storage";
import type { DocusignEnvelope } from "@/generated/prisma/client";

// DocuSign's own envelope-status vocabulary -> ours, ranked so a
// redelivered or out-of-order event never regresses status. declined/
// voided share completed's rank deliberately — all three are terminal;
// whichever lands first wins, and no other terminal event may override it.
const STATUS_RANK = { created: 0, sent: 1, delivered: 2, completed: 3, declined: 3, voided: 3 } as const;
type RawStatus = keyof typeof STATUS_RANK;

// Unauthenticated by nature — DocuSign Connect calls this directly, no
// session. Security is the signature check, same split as the Stripe and
// Calendly webhook routes.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-docusign-signature-1");

  let event: ReturnType<typeof verifyDocusignWebhookSignature>;
  try {
    event = verifyDocusignWebhookSignature(rawBody, sig);
  } catch (error) {
    if (error instanceof DocusignWebhookError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof DocusignConfigError) return NextResponse.json({ error: error.message }, { status: 500 });
    throw error;
  }

  const envelopeId = event.data.envelopeId;
  const rawStatus = event.data.envelopeSummary?.status?.toLowerCase() as RawStatus | undefined;
  if (!envelopeId || !rawStatus || !(rawStatus in STATUS_RANK)) {
    return NextResponse.json({ received: true }); // nothing this route understands — ack anyway so DocuSign stops retrying
  }

  const envelope = await prisma.docusignEnvelope.findUnique({ where: { docusignEnvelopeId: envelopeId } });
  // Unknown to us (a test ping, or an envelope not sent through HCLM) — ack
  // and no-op, same as the Calendly route's "ignore unknown" idempotency.
  if (!envelope) return NextResponse.json({ received: true });

  const currentRank = STATUS_RANK[envelope.status.toLowerCase() as RawStatus] ?? 0;
  if (STATUS_RANK[rawStatus] <= currentRank) return NextResponse.json({ received: true });

  const now = new Date();
  const statusUpper = rawStatus.toUpperCase() as DocusignEnvelope["status"];
  const updated = await prisma.docusignEnvelope.update({
    where: { id: envelope.id },
    data: {
      status: statusUpper,
      sentAt: rawStatus === "sent" ? (envelope.sentAt ?? now) : envelope.sentAt,
      deliveredAt: rawStatus === "delivered" ? now : envelope.deliveredAt,
      completedAt: rawStatus === "completed" ? now : envelope.completedAt,
      declinedAt: rawStatus === "declined" ? now : envelope.declinedAt,
      voidedAt: rawStatus === "voided" ? now : envelope.voidedAt,
    },
  });

  // No recordAudit here — AuditLog.actorId is a hard FK to User, and this
  // is DocuSign telling us something happened, not a real user's own
  // action (same reasoning as the Calendly webhook and public-forms.ts's
  // submitForm never auditing their own system-originated writes). The
  // status/timestamp columns on the row itself are the durable record.

  const ref = await entityRefFor(updated);

  if (rawStatus === "completed") {
    await downloadCompleted(updated);
    if (ref) {
      await notify(
        { userId: envelope.sentById, type: "ENVELOPE_COMPLETED", message: `${envelope.signerName} signed the document you sent`, ...ref },
        "system"
      );
    }
  } else if (rawStatus === "declined" && ref) {
    await notify(
      { userId: envelope.sentById, type: "ENVELOPE_DECLINED", message: `${envelope.signerName} declined to sign the document you sent`, ...ref },
      "system"
    );
  }

  return NextResponse.json({ received: true });
}

// notify() IS appropriate to call from this route (unlike
// meeting-reminders.ts's bare setInterval) — this is a real route handler
// with a live request context, exactly like the Calendly webhook's own
// notify(..., "system") call.
async function entityRefFor(envelope: DocusignEnvelope): Promise<{ entityType: string; entityId: string } | null> {
  if (envelope.applicationId) return { entityType: "Application", entityId: envelope.applicationId };
  if (envelope.clientAgreementId) {
    const agreement = await prisma.clientAgreement.findUnique({
      where: { id: envelope.clientAgreementId },
      select: { clientId: true },
    });
    return agreement ? { entityType: "Client", entityId: agreement.clientId } : null;
  }
  return null;
}

async function downloadCompleted(envelope: DocusignEnvelope) {
  try {
    const buffer = await downloadCompletedDocument(envelope.docusignEnvelopeId);
    const source = await prisma.fileAsset.findUniqueOrThrow({ where: { id: envelope.sourceFileAssetId } });
    const { storageKey, sizeBytes, generation } = await saveBuffer(buffer, ".pdf");
    const ref = await entityRefFor(envelope);
    const fileName = `Signed - ${source.fileName}`;

    const fileAsset = await prisma.fileAsset.create({
      data: {
        applicationId: envelope.applicationId,
        clientId: ref?.entityType === "Client" ? ref.entityId : null,
        fileName,
        storageKey,
        mimeType: "application/pdf",
        sizeBytes,
        uploadedById: envelope.sentById, // the person who sent it, not a fake system actor
        versions: {
          create: { version: 1, generation, fileName, mimeType: "application/pdf", sizeBytes, uploadedById: envelope.sentById },
        },
      },
    });

    await prisma.docusignEnvelope.update({
      where: { id: envelope.id },
      data: { completedFileAssetId: fileAsset.id },
    });
  } catch (error) {
    // Best-effort: the status update above already landed regardless of
    // whether the download succeeds — a transient DocuSign API hiccup here
    // must never roll back the status change or crash the webhook
    // response. Logged, not silently lost — same convention as every other
    // best-effort external call this session (Teams/SMS in
    // meeting-reminders.ts).
    console.error(`Failed to download completed document for envelope ${envelope.id}:`, error);
  }
}
