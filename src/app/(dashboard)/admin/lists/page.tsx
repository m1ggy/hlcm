import { blockCaregiverRoute } from "@/lib/rbac";
import { listPicklistsForAdmin } from "@/lib/actions/picklists";
import { PicklistsManager } from "@/components/admin/picklists-manager";

export default async function ListsPage() {
  await blockCaregiverRoute();
  const lists = await listPicklistsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lists</h1>
        <p className="text-sm text-muted-foreground">
          The choices offered in agency, MCO and &quot;ball is with&quot; pickers. Retiring an option hides it from pickers
          without changing cases that already use it.
        </p>
      </div>
      <PicklistsManager lists={lists} />
    </div>
  );
}
