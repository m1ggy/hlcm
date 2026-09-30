import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { enterAsSupport } from "@/lib/actions/support";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Where the platform console's "Open as support" link lands
// (src/lib/support-access.ts). A button rather than an automatic sign-in, so
// a prefetch or link preview can't use up the one-time link.
export default async function SupportEnterPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const org = await getHostOrg();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Open {org?.name ?? "this workspace"} as support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {error || !token ? (
            <p>This support link has expired or was already used. Start a new session from the platform console.</p>
          ) : (
            <>
              <p>
                You&apos;ll be signed in as <strong>{PRODUCT_NAME} Support</strong>. Everything you do is recorded in this
                workspace&apos;s audit log, and the session ends when the owner&apos;s support access does.
              </p>
              <form action={enterAsSupport}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" className="w-full">
                  Continue as support
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
