import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Activity = { id: string; action: string; newValue: string | null; createdAt: Date; actor: { name: string } };

const ACTIVITY_LABEL: Record<string, string> = {
  support_access_granted: "Support access turned on",
  support_access_revoked: "Support access turned off",
  support_session_started: "Signed in",
};

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Platform admins can open any workspace (src/lib/support-access.ts); owners
// see every time they did here, from the audit log. Read-only — there's
// nothing to grant.
export function PlatformAccessSection({ productName, activity }: { productName: string; activity: Activity[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {productName}&apos;s platform admins can sign in to this workspace to help or fix things, each as their own account
          marked &quot;(Platform)&quot;. They don&apos;t show up in your user list, and everything they do is recorded in your audit
          log.
        </p>
        {activity.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  {a.actor.name} <span className="text-muted-foreground">— {ACTIVITY_LABEL[a.action] ?? a.action}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No platform admin has signed in yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
