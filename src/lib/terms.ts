import { PLATFORM_SLUG } from "@/lib/tenant-host";

// The platform's terms of service and privacy policy, which each workspace's
// owner accepts on the organization's behalf before the workspace can be
// used (the BAA is part of the terms). Configured by env: until TERMS_VERSION, TERMS_URL and PRIVACY_URL are
// all set, nothing is asked. Bumping TERMS_VERSION asks every owner again.

export type TermsConfig = { version: string; termsUrl: string; privacyUrl: string; baaUrl: string };

export function currentTerms(): TermsConfig | null {
  const version = process.env.TERMS_VERSION?.trim();
  const termsUrl = process.env.TERMS_URL?.trim();
  const privacyUrl = process.env.PRIVACY_URL?.trim();
  if (!version || !termsUrl || !privacyUrl) return null;
  // The BAA sits next to the terms (src/app/legal/baa) unless BAA_URL says otherwise.
  const baaUrl = process.env.BAA_URL?.trim() || new URL("/legal/baa", termsUrl).toString();
  return { version, termsUrl, privacyUrl, baaUrl };
}

/** Whether `org` still has to accept the current terms (never the platform org). */
export function needsTermsAcceptance(org: { slug: string; termsVersion: string | null }, terms = currentTerms()) {
  return Boolean(terms && org.slug !== PLATFORM_SLUG && org.termsVersion !== terms.version);
}
