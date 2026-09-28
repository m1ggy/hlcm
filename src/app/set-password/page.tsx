import Link from "next/link";
import { peekAuthToken } from "@/lib/auth-tokens";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

// Where invite and password-reset emails land (src/lib/auth-emails.ts).
// Checks the token up front so an expired link says so before anyone types.
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const org = await getHostOrg();
  const brand = org?.status === "ACTIVE" ? org.name : PRODUCT_NAME;
  const valid = org?.status === "ACTIVE" ? await peekAuthToken(token) : null;

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{brand}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">This link has expired or was already used.</p>
            <p className="text-sm text-muted-foreground">
              Reset links last an hour and invites a week. <Link href="/forgot-password" className="underline">Request a new link</Link>, or
              ask your administrator to resend your invite.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const title = valid.kind === "INVITE" ? `Welcome to ${brand}` : `${brand} — New password`;
  return <SetPasswordForm token={token} title={title} email={valid.user.email} />;
}
