import { Fragment } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/simple-markdown";

// Renders one of our own Markdown docs (src/lib/simple-markdown.ts) as React
// elements, styled for reading inside the app.

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === "text") return <Fragment key={i}>{n.text}</Fragment>;
        if (n.kind === "bold") return <strong key={i} className="font-semibold text-foreground"><InlineView nodes={n.children} /></strong>;
        if (n.kind === "italic") return <em key={i}><InlineView nodes={n.children} /></em>;
        const external = /^https?:/i.test(n.href);
        return (
          <a key={i} href={n.href} className="font-medium text-primary underline underline-offset-2" {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
            <InlineView nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1) return <h1 id={block.id} className="scroll-mt-20 font-heading text-3xl font-semibold tracking-tight">{block.text}</h1>;
      if (block.level === 2)
        return <h2 id={block.id} className="mt-10 scroll-mt-20 border-b pb-2 font-heading text-xl font-semibold tracking-tight">{block.text}</h2>;
      return <h3 id={block.id} className="mt-6 scroll-mt-20 text-base font-semibold">{block.text}</h3>;
    case "paragraph":
      return <p className="leading-7 text-muted-foreground"><InlineView nodes={block.children} /></p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`ml-6 space-y-1.5 leading-7 text-muted-foreground ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, i) => (
            <li key={i}><InlineView nodes={item} /></li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.head.map((c, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold"><InlineView nodes={c} /></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    <td key={i} className="px-3 py-2 align-top text-muted-foreground"><InlineView nodes={c} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        <figure className="space-y-2">
          {/* Our own screenshots in public/, already sized; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt} loading="lazy" className="w-full rounded-lg border shadow-sm" />
          <figcaption className="text-xs text-muted-foreground">{block.alt}</figcaption>
        </figure>
      );
  }
}

export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <article className="space-y-4">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </article>
  );
}

/** The doc's ## headings, for a table of contents. */
export function markdownOutline(source: string) {
  return parseMarkdown(source).flatMap((b) => (b.kind === "heading" && b.level === 2 ? [{ id: b.id, text: b.text }] : []));
}
