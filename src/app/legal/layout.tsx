import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LEGAL_PAGES, LEGAL_UPDATED, legalEntity } from "@/lib/legal";

// Public legal pages (no sign-in): src/auth.config.ts lets /legal/* through.
export const metadata: Metadata = { robots: { index: false } };

export default function LegalLayout({ children }: { children: ReactNode }) {
  const entity = legalEntity();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <BrandLogo />
          <nav aria-label="Legal documents" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="text-muted-foreground hover:text-foreground hover:underline">
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        {entity.isDraft && (
          <div role="note" className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            Draft. These documents haven&apos;t been finalized and aren&apos;t in effect yet.
          </div>
        )}
        <article className="space-y-4 text-sm text-foreground sm:text-[0.95rem]">{children}</article>
        <p className="mt-12 border-t pt-4 text-xs text-muted-foreground">
          Last updated {LEGAL_UPDATED}. Questions: {entity.email}
        </p>
      </div>
    </div>
  );
}
