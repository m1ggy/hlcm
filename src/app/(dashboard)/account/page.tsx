import { getAccount } from "@/lib/actions/account";
import { getMySignatureProfile } from "@/lib/actions/signatures";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { MfaSection } from "@/components/account/mfa-section";
import { SignaturePadSection } from "@/components/account/signature-pad-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const [account, signatureProfile] = await Promise.all([getAccount(), getMySignatureProfile()]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">{account.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Multi-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaSection initialEnabled={account.mfaEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <SignaturePadSection initialImageUrl={signatureProfile ? "/api/signatures/profile" : null} />
        </CardContent>
      </Card>
    </div>
  );
}
