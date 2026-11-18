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
              <strong>Category</strong> sets whether time there counts as Productive, Neutral or Unproductive.
            </p>
            <p>Changes apply to past days too (scores are worked out when you view them). Paid hours never change.</p>
          </PageInfoButton>
        </div>
      </div>
      <RulesManager rules={rules} unclassified={unclassified} users={users} />
    </div>
  );
}
