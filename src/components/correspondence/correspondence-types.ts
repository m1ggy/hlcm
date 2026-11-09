export type CorrespondenceKind = "EMAIL" | "SCREENSHOT" | "LETTER" | "PHONE_CALL" | "PORTAL_MESSAGE" | "OTHER";
export type CorrespondenceDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";

export type CorrespondenceRow = {
  id: string;
  kind: CorrespondenceKind;
  direction: CorrespondenceDirection;
  subject: string;
  fromParty: string | null;
  toParty: string | null;
  occurredAt: string;
  body: string | null;
  clientVisible: boolean;
  createdAt: string;
  createdBy: { id: string; name: string };
  task: { id: string; label: string } | null;
  applicationId: string | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
};

export const KIND_LABELS: Record<CorrespondenceKind, string> = {
  EMAIL: "Email",
  SCREENSHOT: "Screenshot",
  LETTER: "Letter",
  PHONE_CALL: "Phone call",
  PORTAL_MESSAGE: "Portal message",
  OTHER: "Other",
};

export const DIRECTION_LABELS: Record<CorrespondenceDirection, string> = {
  INBOUND: "Received",
  OUTBOUND: "Sent",
  INTERNAL: "Internal",
};
