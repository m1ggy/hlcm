"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { grantSupportAccess, revokeSupportAccess } from "@/lib/actions/support";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Activity = { id: string; action: string; newValue: string | null; createdAt: Date; actor: { name: string } };

const GRANTS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

const ACTIVITY_LABEL: Record<string, string> = {
  support_access_granted: "Support access turned on",
  support_access_revoked: "Support access turned off",
  support_session_started: "Support signed in",
};

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Owners let platform support into the workspace for a limited time
// (src/lib/support-access.ts); every grant, revoke and support sign-in is
// listed here from the audit log.
export function SupportAccessSection({ until, productName, activity }: { until: Date | null; productName: string; activity: Activity[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const active = until !== null && new Date(until) > new Date();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong. Please try again."));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {`Lets ${productName} support sign in to this workspace to help you, as a separate "${productName} Support" account.`} Everything they do is recorded in your audit log, and access ends automatically.
        </p>
        <p>
          {active ? (
            <>
              <strong>On</strong> until {formatDateTime(until!)}
            </>
          ) : (
            <strong>Off</strong>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {GRANTS.map((g) => (
            <Button key={g.hours} variant="outline" size="sm" disabled={isPending} onClick={() => run(() => grantSupportAccess(g.hours), `Support access on for ${g.label}`)}>
              {active ? `Extend to ${g.label}` : `Allow for ${g.label}`}
            </Button>
          ))}
          {active && (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => run(revokeSupportAccess, "Support access turned off")}>
              Turn off now
            </Button>
          )}
        </div>
        {activity.length > 0 && (
          <ul className="divide-y rounded-md border">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  {ACTIVITY_LABEL[a.action] ?? a.action}
                  {a.action !== "support_session_started" && <span className="text-muted-foreground"> by {a.actor.name}</span>}
                </span>
                <span className="text-muted-foreground tabular-nums">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
