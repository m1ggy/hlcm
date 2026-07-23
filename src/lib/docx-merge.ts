import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// Scans the template body for `{tag}` merge tags so the admin UI can suggest
// field rows instead of making them retype every tag by hand.
export function extractMergeTags(buffer: Buffer): string[] {
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const tags = new Set<string>();
  for (const match of xml.matchAll(/\{(\w+)\}/g)) {
    tags.add(match[1]);
  }
  return [...tags];
}

export function mergeDocx(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" });
}
