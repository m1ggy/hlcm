import { Badge } from "@/components/ui/badge";
import { computeEnvelopeAlerts } from "@/lib/aging-alerts";
import type { $Enums } from "@/generated/prisma/client";

const STATUS_LABEL: Record<$Enums.DocusignEnvelopeStatus, string> = {
  CREATED: "Created",
  SENT: "Sent",
  DELIVERED: "Viewed",
  COMPLETED: "Signed",
  DECLINED: "Declined",
  VOIDED: "Voided",
};

// Same day-math + severity mapping as ExpiryBadge on client-licenses-card.tsx
// (computeLicenseAlerts's envelope-shaped sibling, computeEnvelopeAlerts) —
// while an envelope is still outstanding (SENT/DELIVERED) and has an
// expiresAt, lead with the expiry countdown once it's within the warning
// window; otherwise show the plain status.
export function EnvelopeStatusBadge({
  status,
  expiresAt,
}: {
  status: $Enums.DocusignEnvelopeStatus;
  expiresAt: Date | null;
}) {
  if ((status === "SENT" || status === "DELIVERED") && expiresAt) {
    const [alert] = computeEnvelopeAlerts(new Date(expiresAt));
    if (alert) return <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>{alert.message}</Badge>;
  }
  const variant = status === "COMPLETED" ? "default" : status === "DECLINED" || status === "VOIDED" ? "outline" : "secondary";
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}
