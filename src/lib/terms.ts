import { PLATFORM_SLUG } from "@/lib/tenant-host";

// The platform's terms of service and privacy policy, which each workspace's
// owner accepts on the organization's behalf before the workspace can be
// used. Configured by env: until TERMS_VERSION, TERMS_URL and PRIVACY_URL are
// all set, nothing is asked. Bumping TERMS_VERSION asks every owner again.

export type TermsConfig = { version: string; termsUrl: string; privacyUrl: string };

export function currentTerms(): TermsConfig | null {
  const version = process.env.TERMS_VERSION?.trim();
  const termsUrl = process.env.TERMS_URL?.trim();
  const privacyUrl = process.env.PRIVACY_URL?.trim();
  return version && termsUrl && privacyUrl ? { version, termsUrl, privacyUrl } : null;
}

/** Whether `org` still has to accept the current terms (never the platform org). */
export function needsTermsAcceptance(org: { slug: string; termsVersion: string | null }, terms = currentTerms()) {
  return Boolean(terms && org.slug !== PLATFORM_SLUG && org.termsVersion !== terms.version);
}
