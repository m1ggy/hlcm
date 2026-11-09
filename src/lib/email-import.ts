import path from "path";
import { simpleParser, type AddressObject } from "mailparser";
import MsgReader from "@kenjiuno/msgreader";

// Reads an uploaded email file (.eml, or Outlook's .msg) into the fields a
// correspondence entry needs plus its attachments (docs/client-portal-eod-plan.md,
// Phase B, decided D6: upload now, forwarding address later).

export type ImportedEmail = {
  subject: string;
  from: string | null;
  to: string | null;
  date: Date | null;
  body: string | null;
  attachments: { fileName: string; mimeType: string; content: Buffer }[];
};

/** Tiny inline images are signature logos and tracking pixels, not attachments anyone wants. */
const MIN_INLINE_IMAGE_BYTES = 4 * 1024;
const MAX_BODY_CHARS = 100_000;

export function isEmailFile(fileName: string) {
  return /\.(eml|msg)$/i.test(fileName);
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
};
export const mimeFromName = (fileName: string) => MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";

const clip = (text: string | null | undefined) => {
  const t = text?.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, MAX_BODY_CHARS) : null;
};

/** "Dana State <dana@state.gov>, ops@x.com" (mailparser's own text quotes the names). */
const addressText = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .flatMap((x) => x.value)
    .map((v) => (v.name && v.address ? `${v.name} <${v.address}>` : v.name || v.address || ""))
    .filter(Boolean)
    .join(", ") || null;

/** Strips tags for the rare email that has only an HTML body. */
const htmlToText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

async function parseEml(buffer: Buffer): Promise<ImportedEmail> {
  const mail = await simpleParser(buffer, { skipHtmlToText: false });
  return {
    subject: mail.subject?.trim() || "(no subject)",
    from: addressText(mail.from),
    to: addressText(mail.to),
    date: mail.date ?? null,
    body: clip(mail.text || (typeof mail.html === "string" ? htmlToText(mail.html) : null)),
    attachments: mail.attachments
      .filter((a) => !(a.related && a.contentType.startsWith("image/") && a.size < MIN_INLINE_IMAGE_BYTES))
      .map((a, i) => ({
        fileName: a.filename || `attachment-${i + 1}${a.contentType === "message/rfc822" ? ".eml" : ""}`,
        mimeType: a.contentType || "application/octet-stream",
        content: a.content,
      })),
  };
}

function parseMsg(buffer: Buffer): ImportedEmail {
  const reader = new MsgReader(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const data = reader.getFileData();
  if (data.error) throw new Error(data.error);
  const person = (name?: string, email?: string) => (name && email && name !== email ? `${name} <${email}>` : name || email || "");
  const to = (data.recipients ?? [])
    .filter((r) => (r.recipType ?? "to") === "to")
    .map((r) => person(r.name, r.smtpAddress || r.email))
    .filter(Boolean)
    .join(", ");
  const when = data.messageDeliveryTime || data.clientSubmitTime || data.creationTime;
  const date = when ? new Date(when) : null;
  return {
    subject: data.subject?.trim() || "(no subject)",
    from: person(data.senderName, data.senderSmtpAddress || data.senderEmail) || null,
    to: to || null,
    date: date && !Number.isNaN(date.getTime()) ? date : null,
    body: clip(data.body || (data.bodyHtml ? htmlToText(data.bodyHtml) : null)),
    attachments: (data.attachments ?? [])
      .filter((a) => !a.attachmentHidden && !a.innerMsgContent)
      .map((a) => {
        const file = reader.getAttachment(a);
        const fileName = file.fileName || a.fileName || "attachment";
        return { fileName, mimeType: a.attachMimeTag || mimeFromName(fileName), content: Buffer.from(file.content) };
      })
      .filter((a) => !(a.mimeType.startsWith("image/") && a.content.byteLength < MIN_INLINE_IMAGE_BYTES)),
  };
}

/** Throws a plain Error when the file can't be read as an email. */
export async function parseEmailFile(fileName: string, buffer: Buffer): Promise<ImportedEmail> {
  return /\.msg$/i.test(fileName) ? parseMsg(buffer) : parseEml(buffer);
}
