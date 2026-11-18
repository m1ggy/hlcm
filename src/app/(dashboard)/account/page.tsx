import { auth } from "@/auth";
import { getAccount, type TextAlertKind } from "@/lib/actions/account";
import { currentOrganization } from "@/lib/db";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { MfaSection } from "@/components/account/mfa-section";
import { EmailNotificationsToggle } from "@/components/account/email-notifications-toggle";
import { TimezoneSection } from "@/components/account/timezone-section";
import { TextAlertsSection } from "@/components/account/text-alerts-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const [account, org, session] = await Promise.all([getAccount(), currentOrganization(), auth()]);
  // Which text opt-ins fit: form alerts in a full workspace; in a client's
  // workspace, the daily update for the client's own people (when the team
  // has turned it on). Urgent task alerts for everyone but caregivers. The
  // team's linked accounts in a client workspace have none here — theirs
  // live on their home account.
  const caregiver = session?.user.role === "CAREGIVER";
  const linked = org.kind === "TASKS" && Boolean(session?.user.isAssigned);
  const texts: { kind: TextAlertKind; enabled: boolean }[] =
    caregiver || linked
      ? []
      : [
          ...(org.kind !== "TASKS" ? [{ kind: "forms" as const, enabled: account.smsFormAlerts }] : []),
          ...(org.kind === "TASKS" && org.workDailyText ? [{ kind: "daily" as const, enabled: account.smsDailyUpdates }] : []),
          { kind: "urgent" as const, enabled: account.smsUrgentAlerts },
        ];

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
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailNotificationsToggle initialEnabled={account.emailNotificationsEnabled} />
          {texts.length > 0 && (
            <div className="mt-5 border-t pt-5">
              <TextAlertsSection options={texts} phone={account.phone} optedOut={Boolean(account.smsOptedOutAt)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-tour="timezone-setting">
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <TimezoneSection initialTimezone={account.timezone} defaultTimezone={account.workspaceTimezone} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
