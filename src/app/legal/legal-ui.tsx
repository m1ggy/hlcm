import type { ReactNode } from "react";

// Small typographic pieces for the legal pages (no typography plugin here).

export function Section({ n, title, children }: { n?: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="pt-4 text-lg font-semibold">
        {n && <span className="mr-2 text-muted-foreground">{n}.</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-1.5 leading-relaxed">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="ml-5 list-[lower-alpha] space-y-1.5 leading-relaxed">{children}</ol>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium underline underline-offset-4">
      {children}
    </a>
  );
}
