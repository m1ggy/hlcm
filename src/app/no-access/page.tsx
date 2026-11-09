import { signOut } from "@/auth";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Where a client-portal account lands now that the portal is retired
// (docs/client-portal-eod-plan.md, D9): clients follow their application
// through a share link instead, no account needed.
export default async function NoAccessPage() {
  const org = await getHostOrg();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{org?.name ?? PRODUCT_NAME}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Client accounts aren&apos;t used here anymore. Ask your contact for a link to your application&apos;s progress page — it opens without signing in.</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
