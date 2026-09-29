// Building blocks shared by the Modern invoice and receipt layouts
// (./modern-invoice.ts, ./modern-receipt.ts) — the boxed, navy-and-cream
// look copied from CTK's spreadsheet invoice (docs/Altru Social
// Services-Invoice 2026-005.xlsx_9656.pdf). Coordinates here are measured
// from the TOP of the page (pdf-lib's own origin is bottom-left) so they
// read the same way as the sample; `yFromTop` converts.
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { PAGE_SIZE, wrapText } from "@/lib/invoice-pdf";
import type { SenderDetails } from "./options";

export const NAVY = rgb(0.106, 0.216, 0.365);
export const STEEL = rgb(0.18, 0.37, 0.6);
export const CREAM = rgb(1, 0.992, 0.925);
export const LIGHT_BLUE = rgb(0.91, 0.945, 0.972);
export const GRID = rgb(0.8, 0.84, 0.88);
export const GOLD = rgb(0.85, 0.6, 0.1);
export const GRAY = rgb(0.4, 0.4, 0.4);
export const TEXT = rgb(0.12, 0.12, 0.12);
export const WHITE = rgb(1, 1, 1);

export const LEFT = 44;
export const RIGHT = PAGE_SIZE[0] - 28;
/** Lowest a table row or section may reach before moving to a new page —
 * leaves room for the "Page X of N" footer. */
export const BOTTOM_LIMIT = PAGE_SIZE[1] - 50;

export type Fonts = { font: PDFFont; bold: PDFFont };

export function yFromTop(top: number) {
  return PAGE_SIZE[1] - top;
}

/** Filled (and optionally bordered) rectangle, positioned by its top edge. */
export function box(
  page: PDFPage,
  opts: { x: number; top: number; width: number; height: number; fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb> }
) {
  page.drawRectangle({
    x: opts.x,
    y: yFromTop(opts.top + opts.height),
    width: opts.width,
    height: opts.height,
    color: opts.fill,
    borderColor: opts.border,
    borderWidth: opts.border ? 0.75 : 0,
  });
}

export function hline(page: PDFPage, opts: { x1: number; x2: number; top: number; color: ReturnType<typeof rgb>; thickness?: number }) {
  page.drawLine({
    start: { x: opts.x1, y: yFromTop(opts.top) },
    end: { x: opts.x2, y: yFromTop(opts.top) },
    thickness: opts.thickness ?? 0.75,
    color: opts.color,
  });
}

type TextOpts = { size: number; font: PDFFont; color?: ReturnType<typeof rgb> };

export function text(page: PDFPage, value: string, x: number, baseline: number, opts: TextOpts) {
  page.drawText(value, { x, y: yFromTop(baseline), size: opts.size, font: opts.font, color: opts.color ?? TEXT });
}

export function textRight(page: PDFPage, value: string, right: number, baseline: number, opts: TextOpts) {
  text(page, value, right - opts.font.widthOfTextAtSize(value, opts.size), baseline, opts);
}

export function textCenter(page: PDFPage, value: string, left: number, width: number, baseline: number, opts: TextOpts) {
  text(page, value, left + (width - opts.font.widthOfTextAtSize(value, opts.size)) / 2, baseline, opts);
}

/** "Label: " in regular weight followed by the value in bold, on one line. */
export function labeledValue(page: PDFPage, label: string, value: string, x: number, baseline: number, fonts: Fonts, size = 9) {
  text(page, label, x, baseline, { size, font: fonts.font });
  if (value) text(page, value, x + fonts.font.widthOfTextAtSize(label, size), baseline, { size, font: fonts.bold });
}

/** MM/DD/YY, from the UTC calendar fields — same reasoning as
 * formatCalendarDate in src/lib/invoice-format.ts. */
export function shortDate(date: Date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

/**
 * Logo (or the profile name as a wordmark), the big title, the cream meta
 * box of label/value rows on the right, the sender block, and the rule
 * under it all. Returns the rule's position (from the top).
 */
export async function drawModernHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  opts: {
    title: string;
    meta: { label: string; value: string }[];
    logo?: { bytes: Uint8Array; mimeType: string } | null;
    profileName: string;
    sender: SenderDetails | null;
  }
): Promise<number> {
  if (opts.logo) {
    const image = opts.logo.mimeType === "image/png" ? await pdfDoc.embedPng(opts.logo.bytes) : await pdfDoc.embedJpg(opts.logo.bytes);
    const scale = Math.min(150 / image.width, 70 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: LEFT, y: yFromTop(30 + height), width, height });
  } else {
    text(page, opts.profileName, LEFT, 62, { size: 16, font: fonts.bold, color: NAVY });
  }

  textRight(page, opts.title, RIGHT, 58, { size: 24, font: fonts.bold, color: STEEL });

  const metaLeft = 473;
  const rowHeight = 24;
  const metaTop = 74;
  box(page, { x: metaLeft, top: 62, width: RIGHT - metaLeft, height: 12 + rowHeight * opts.meta.length, fill: CREAM });
  opts.meta.forEach((row, i) => {
    const rowTop = metaTop + i * rowHeight;
    text(page, row.label, 376, rowTop + 16, { size: 7.5, font: fonts.bold, color: GRAY });
    textRight(page, row.value, RIGHT - 4, rowTop + 16, { size: 10, font: fonts.font });
    hline(page, { x1: metaLeft, x2: RIGHT, top: rowTop + rowHeight, color: GRID, thickness: 0.5 });
  });
  const metaBottom = metaTop + rowHeight * opts.meta.length;

  // Without a logo the name is already the wordmark above — don't repeat it.
  let y = 131;
  if (opts.logo) {
    text(page, opts.profileName, LEFT + 3, y, { size: 11, font: fonts.bold, color: STEEL });
  }
  y += 21;
  const sender = opts.sender;
  for (const line of (sender?.address ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    text(page, line, LEFT + 3, y, { size: 7.5, font: fonts.font, color: GRAY });
    y += 17;
  }
  const contact = [sender?.phone, sender?.email].filter(Boolean).join("  |  ");
  if (contact) {
    text(page, contact, LEFT + 3, y, { size: 7.5, font: fonts.font, color: GRAY });
    y += 17;
  }

  const ruleTop = Math.max(189, y + 4, metaBottom + 20);
  hline(page, { x1: LEFT, x2: RIGHT, top: ruleTop, color: STEEL, thickness: 1.5 });
  return ruleTop;
}

/**
 * The small steel-blue section label and its cream box of
 * "Label: value" lines (Bill To / Received From). Returns the box's bottom.
 */
export function drawPartyBox(
  page: PDFPage,
  fonts: Fonts,
  opts: { top: number; label: string; lines: { label: string; value: string }[]; width?: number }
): number {
  text(page, opts.label, LEFT + 3, opts.top, { size: 7, font: fonts.bold, color: STEEL });
  const boxTop = opts.top + 5;
  const height = Math.max(82, 70 + (opts.lines.length - 1) * 6);
  box(page, { x: LEFT, top: boxTop, width: opts.width ?? 330, height, fill: CREAM, border: GRID });
  opts.lines.forEach((line, i) => labeledValue(page, line.label, line.value, LEFT + 4, boxTop + 42 - (opts.lines.length - 1) * 6 + i * 12, fonts));
  return boxTop + height;
}

/** Light-blue box of wrapped text under a small label (PAYMENT). Returns its bottom. */
export function drawInfoBox(page: PDFPage, fonts: Fonts, opts: { top: number; label: string; body: string }): number {
  text(page, opts.label, LEFT + 3, opts.top, { size: 7, font: fonts.bold, color: STEEL });
  const lines = wrapText(opts.body, fonts.font, 8, RIGHT - LEFT - 16);
  const boxTop = opts.top + 5;
  const height = 19 + lines.length * 11 + 14;
  box(page, { x: LEFT, top: boxTop, width: RIGHT - LEFT, height, fill: LIGHT_BLUE, border: GRID });
  lines.forEach((line, i) => text(page, line, LEFT + 4, boxTop + 22 + i * 11, { size: 8, font: fonts.font }));
  return boxTop + height;
}

export function infoBoxHeight(fonts: Fonts, body: string) {
  return 5 + 19 + wrapText(body, fonts.font, 8, RIGHT - LEFT - 16).length * 11 + 14;
}

/** "Notes: ____" line (or the actual notes, wrapped; skipped entirely
 * when `notes` is false), a hairline, the thank-you line, and the
 * profile's footer text. Returns the bottom. */
export function drawClosing(
  page: PDFPage,
  fonts: Fonts,
  opts: { top: number; notes: string | null | false; footerText: string | null }
): number {
  let y = opts.top;
  if (opts.notes === false) return drawThanks(page, fonts, y, opts.footerText);
  const labelWidth = fonts.font.widthOfTextAtSize("Notes: ", 7.5);
  text(page, "Notes:", LEFT + 3, y, { size: 7.5, font: fonts.font, color: GRAY });
  if (opts.notes) {
    const lines = wrapText(opts.notes, fonts.font, 8.5, RIGHT - LEFT - labelWidth - 8);
    lines.forEach((line, i) => text(page, line, LEFT + 3 + labelWidth, y + i * 12, { size: 8.5, font: fonts.font }));
    y += (lines.length - 1) * 12;
  } else {
    hline(page, { x1: LEFT + 3 + labelWidth, x2: 355, top: y + 1, color: GRAY, thickness: 0.5 });
  }
  y += 11;
  hline(page, { x1: LEFT, x2: RIGHT, top: y, color: GRID, thickness: 0.5 });
  return drawThanks(page, fonts, y + 31, opts.footerText);
}

function drawThanks(page: PDFPage, fonts: Fonts, top: number, footerText: string | null) {
  let y = top;
  text(page, "Thank you for your business.", LEFT + 3, y, { size: 8.5, font: fonts.bold, color: NAVY });
  if (footerText) {
    y += 18;
    for (const line of wrapText(footerText, fonts.font, 7.5, RIGHT - LEFT - 6)) {
      text(page, line, LEFT + 3, y, { size: 7.5, font: fonts.font, color: GRAY });
      y += 10;
    }
  }
  return y;
}

export function closingHeight(fonts: Fonts, notes: string | null, footerText: string | null) {
  const notesLines = notes ? wrapText(notes, fonts.font, 8.5, RIGHT - LEFT - 60).length : 1;
  const footerLines = footerText ? wrapText(footerText, fonts.font, 7.5, RIGHT - LEFT - 6).length : 0;
  return (notesLines - 1) * 12 + 11 + 31 + (footerLines ? 18 + footerLines * 10 : 0);
}

/** "CTK | Invoice | Page 1 of 2" centered at the bottom of every page. */
export function drawPageFooters(pdfDoc: PDFDocument, fonts: Fonts, profileName: string, docType: string) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, i) => {
    textCenter(page, `${profileName} | ${docType} | Page ${i + 1} of ${pages.length}`, 0, PAGE_SIZE[0], PAGE_SIZE[1] - 26, {
      size: 9,
      font: fonts.font,
    });
  });
}
