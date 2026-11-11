import { PRODUCT_NAME } from "@/lib/branding";

// Who the platform's legal documents (src/app/legal) are between. Set by
// env on the server; until LEGAL_ENTITY_NAME is set the pages show bracketed
// placeholders and a "draft" notice, and shouldn't be used for acceptance
// (TERMS_URL in src/lib/terms.ts).

export const LEGAL_UPDATED = "November 10, 2026";

export function legalEntity() {
  const name = process.env.LEGAL_ENTITY_NAME?.trim();
  return {
    product: PRODUCT_NAME,
    name: name || "[Company legal name]",
    state: process.env.LEGAL_ENTITY_STATE?.trim() || "[State]",
    address: process.env.LEGAL_ENTITY_ADDRESS?.trim() || "[Mailing address]",
    email: process.env.LEGAL_CONTACT_EMAIL?.trim() || "[legal contact email]",
    privacyEmail: process.env.PRIVACY_CONTACT_EMAIL?.trim() || process.env.LEGAL_CONTACT_EMAIL?.trim() || "[privacy contact email]",
    isDraft: !name,
  };
}

export const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/baa", label: "Business Associate Agreement" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
] as const;
