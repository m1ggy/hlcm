// A small Markdown reader for our own docs shown in the app (the staff guide,
// docs/staff-guide.md). It understands only what those docs use: headings,
// paragraphs, bullet and numbered lists, pipe tables, images on their own
// line, **bold**, *italic* and [links](…). The result is a tree the page
// renders as React elements — never raw HTML — so a doc can't inject markup.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; id: string; text: string }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "image"; src: string; alt: string };

/** The id a heading gets, matching GitHub's: lowercase, punctuation dropped, spaces to dashes. */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** Only in-page anchors, site paths and http(s) links; anything else (javascript:, data:) is dropped. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith("#") || (h.startsWith("/") && !h.startsWith("//"))) return h;
  if (/^https?:\/\//i.test(h)) return h;
  return null;
}

/** Bold, italic and links inside one line of text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "bold", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === "*" && src[i + 1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: "italic", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (src[i] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        flush();
        if (href) out.push({ kind: "link", href, children: parseInline(m[1]) });
        else out.push(...parseInline(m[1]));
        i += m[0].length;
        continue;
      }
    }
    text += src[i];
    i++;
  }
  flush();
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Reads a whole document into blocks. */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, id: slugify(text), text });
      i++;
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line.trim());
    if (img) {
      const src = safeHref(img[2]);
      if (src) blocks.push({ kind: "image", alt: img[1], src });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const number = /^\s*\d+\.\s+/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = number.test(line);
      const marker = ordered ? number : bullet;
      const items: Inline[][] = [];
      while (i < lines.length && marker.test(lines[i])) {
        items.push(parseInline(lines[i].replace(marker, "")));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|!\[|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length === 0) {
      // A line no rule above took (e.g. a lone "|"): keep it as text rather than loop forever.
      para.push(line.trim());
      i++;
    }
    blocks.push({ kind: "paragraph", children: parseInline(para.join(" ")) });
  }
  return blocks;
}
