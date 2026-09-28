import { getAccount } from "@/lib/actions/account";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { MfaSection } from "@/components/account/mfa-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Platform admins never see the CRM (their org has none), so they get their
// own account page for the two things that matter on an account this
// powerful: its password and two-factor authentication.
export default async function PlatformAccountPage() {
  const account = await getAccount();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">{account.email}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaSection initialEnabled={account.mfaEnabled} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>
    </div>
  );
}
