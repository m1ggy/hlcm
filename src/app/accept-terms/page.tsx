import { redirect } from "next/navigation";
import { requireSession, isSuperuser } from "@/lib/rbac";
import { currentOrganization } from "@/lib/db";
import { PRODUCT_NAME } from "@/lib/branding";
import { currentTerms, needsTermsAcceptance } from "@/lib/terms";
import { acceptTerms } from "@/lib/actions/terms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Shown instead of the app until the workspace's owner has accepted the
// current terms (src/lib/terms.ts). Everyone else is told who has to.
export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const org = await currentOrganization();
  const terms = currentTerms();
  if (!terms || !needsTermsAcceptance(org, terms)) redirect("/");
  const { error } = await searchParams;
  const isOwner = isSuperuser(session.user.role) && !session.user.isSupport;
  const updated = org.termsVersion !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{updated ? `${PRODUCT_NAME}'s terms have changed` : `Before you start using ${PRODUCT_NAME}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {isOwner ? (
            <form action={acceptTerms} className="space-y-4">
              <p>
                As the owner of <strong>{org.name}</strong>, please review and accept the{" "}
                <a href={terms.termsUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href={terms.privacyUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                  Privacy Policy
                </a>{" "}
                on your organization&apos;s behalf.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="agree" id="agree" required className="mt-0.5 size-4" />
                <span>I have read and agree to them on behalf of {org.name}.</span>
              </label>
              {error && <p className="text-destructive">Tick the box to accept.</p>}
              <Button type="submit" className="w-full">
                Accept and continue
              </Button>
            </form>
          ) : (
            <p>
              {org.name}&apos;s owner needs to accept {PRODUCT_NAME}&apos;s {updated ? "updated " : ""}terms before the workspace
              can be used. Please ask them to sign in.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
