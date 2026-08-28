import { getAccount } from "@/lib/actions/account";
import { getMySignatureProfile } from "@/lib/actions/signatures";
import { getMyWiseRecipient } from "@/lib/actions/wise";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { MfaSection } from "@/components/account/mfa-section";
import { SignaturePadSection } from "@/components/account/signature-pad-section";
import { EmailNotificationsToggle } from "@/components/account/email-notifications-toggle";
import { TimezoneSection } from "@/components/account/timezone-section";
import { PayoutDetailsForm } from "@/components/wise/payout-details-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const [account, signatureProfile, wiseRecipient] = await Promise.all([
    getAccount(),
    getMySignatureProfile(),
    getMyWiseRecipient(),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">{account.email}</p>
      </div>

      <div className="max-w-lg space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailNotificationsToggle initialEnabled={account.emailNotificationsEnabled} />
        </CardContent>
      </Card>

      <Card data-tour="timezone-setting">
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <TimezoneSection initialTimezone={account.timezone} />
        </CardContent>
      </Card>
      </div>

      <Card data-tour="payout-details">
        <CardHeader>
          <CardTitle>Payout details</CardTitle>
        </CardHeader>
        <CardContent>
          <PayoutDetailsForm saved={wiseRecipient} />
        </CardContent>
      </Card>
    </div>
  );
}
