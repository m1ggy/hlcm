import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ForbiddenError, blockCaregiverRoute } from "@/lib/rbac";
import { listProductivityRules, listTrackedUsers, listUnclassifiedApps } from "@/lib/activity-data";
import { RulesManager } from "@/components/activity/rules-manager";
import { PageInfoButton } from "@/components/shared/page-info-button";

export default async function ActivityRulesPage() {
  await blockCaregiverRoute();
  let rules, unclassified, users;
  try {
    [rules, unclassified, users] = await Promise.all([listProductivityRules(), listUnclassifiedApps(), listTrackedUsers()]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/activity" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ChevronLeft className="size-4" /> Activity
        </Link>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">App rules</h1>
          <PageInfoButton title="App rules">
            <p>Rules say how an app, website or window title counts in activity reports.</p>
            <p>
              <strong>Category</strong> sets whether time there counts as Productive, Neutral or Unproductive.{" "}
              <strong>Thinking-time credit</strong> counts part of the time without typing as active, for work like reading code or
              sitting in a meeting. For example, at 60%, 10 minutes in an app with 4 minutes of typing scores 7.6 active minutes.{" "}
              <strong>Idle prompt after</strong> makes the desktop app wait longer before asking &quot;Were you working?&quot;.
            </p>
            <p>Changes apply to past days too (scores are worked out when you view them). Paid hours never change.</p>
          </PageInfoButton>
        </div>
      </div>
      <RulesManager rules={rules} unclassified={unclassified} users={users} />
    </div>
  );
}
