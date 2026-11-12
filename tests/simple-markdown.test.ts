import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref, slugify } from "@/lib/simple-markdown";

// The Markdown reader behind the in-app staff guide (docs/staff-guide.md).

describe("parseMarkdown", () => {
  it("reads headings, paragraphs, lists, tables and images", () => {
    const blocks = parseMarkdown(
      [
        "# Title",
        "",
        "First line",
        "continues here.",
        "",
        "## All your client tasks in one place",
        "",
        "1. One",
        "2. **Two**",
        "",
        "- a",
        "- b",
        "",
        "| Role | Can do |",
        "| --- | --- |",
        "| Staff | Work tasks |",
        "",
        "![A screenshot](/staff-guide/eod.png)",
      ].join("\n")
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "heading", "list", "list", "table", "image"]);
    expect(blocks[1]).toEqual({ kind: "paragraph", children: [{ kind: "text", text: "First line continues here." }] });
    expect(blocks[2]).toMatchObject({ level: 2, id: "all-your-client-tasks-in-one-place" });
    expect(blocks[3]).toMatchObject({ ordered: true, items: [[{ kind: "text", text: "One" }], [{ kind: "bold" }]] });
    expect(blocks[5]).toMatchObject({ kind: "table", rows: [[[{ text: "Staff" }], [{ text: "Work tasks" }]]] });
    expect(blocks[6]).toEqual({ kind: "image", alt: "A screenshot", src: "/staff-guide/eod.png" });
  });

  it("keeps bold, italic and links, and drops unsafe link targets", () => {
    expect(parseInline("a **b** *c* [d](#x)")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "c" }] },
      { kind: "text", text: " " },
      { kind: "link", href: "#x", children: [{ kind: "text", text: "d" }] },
    ]);
    expect(parseInline("[click](javascript:alert(1))")[0]).toEqual({ kind: "text", text: "click" });
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("https://carenela.com")).toBe("https://carenela.com");
    expect(parseMarkdown("![x](data:image/png;base64,AAA)")).toEqual([]);
  });

  it("gives headings GitHub-style ids", () => {
    expect(slugify("The end-of-day (EOD) report")).toBe("the-end-of-day-eod-report");
    expect(slugify("Projects & tasks")).toBe("projects--tasks");
  });

  it("reads the staff guide, whose in-page links all point at its headings", () => {
    const source = readFileSync(path.join(process.cwd(), "docs", "staff-guide.md"), "utf8");
    const blocks = parseMarkdown(source);
    const ids = new Set(blocks.flatMap((b) => (b.kind === "heading" ? [b.id] : [])));
    const anchors = [...source.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(ids).toContain(a);
    const images = blocks.flatMap((b) => (b.kind === "image" ? [b.src] : []));
    expect(images).toHaveLength(10);
    for (const src of images) expect(() => readFileSync(path.join(process.cwd(), "public", src))).not.toThrow();
  });
});
