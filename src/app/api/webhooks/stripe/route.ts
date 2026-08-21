import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { verifyWebhookSignature, StripeApiError } from "@/lib/stripe";
import { displayInvoiceNumber } from "@/lib/actions/invoices";

type StripeInvoiceObject = {
  id: string;
  number: string | null;
  status: string;
  total: number;
  tax: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

// Unauthenticated by nature — Stripe calls this directly, there's no
// session. Security is the signature check, not requireSession/requireRole
// (contrast with src/app/api/documents/[id]/route.ts, which verifies a
// session instead of a signature).
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = verifyWebhookSignature(rawBody, sig);
  } catch (error) {
    if (error instanceof StripeApiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const stripeInvoice = event.data.object as unknown as StripeInvoiceObject;

  if (event.type === "invoice.paid") {
    const invoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: stripeInvoice.id } });
    // Idempotent: ignore unknown invoices or one already marked paid — a
    // redelivered webhook event must never double-fire the notification.
    if (invoice && invoice.status !== "PAID") {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          total: stripeInvoice.total / 100,
          taxAmount: (stripeInvoice.tax ?? 0) / 100,
          stripeInvoiceNumber: stripeInvoice.number,
          hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          invoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });
      await recordAudit({
        entityType: "Invoice",
        entityId: invoice.id,
        action: "paid_online",
        actorId: invoice.createdById,
      });
      // actorId "system" (not a real user id) — this is Stripe telling us
      // the client paid, not the creator's own action, so notify() must
      // not skip it via its "don't notify someone about their own action"
      // self-check.
      await notify(
        {
          userId: invoice.createdById,
          type: "INVOICE_PAID",
          message: `Invoice ${displayInvoiceNumber({ seq: invoice.seq, stripeInvoiceNumber: stripeInvoice.number })} was paid`,
          entityType: "Invoice",
          entityId: invoice.id,
        },
        "system"
      );
    }
  } else if (event.type === "invoice.voided") {
    const invoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: stripeInvoice.id } });
    if (invoice && invoice.status !== "VOID") {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
      await recordAudit({ entityType: "Invoice", entityId: invoice.id, action: "void", actorId: invoice.createdById });
    }
  } else if (event.type === "invoice.payment_failed" || event.type === "invoice.finalization_failed") {
    const invoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: stripeInvoice.id } });
    if (invoice) {
      await recordAudit({
        entityType: "Invoice",
        entityId: invoice.id,
        action: event.type === "invoice.payment_failed" ? "payment_failed" : "finalization_failed",
        actorId: invoice.createdById,
      });
    }
  }

  return NextResponse.json({ received: true });
}
