import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { auth } from "@/auth";
import { listUsers } from "@/lib/actions/users";
import { NewUserDialog } from "@/components/admin/new-user-dialog";
import { UsersTable } from "@/components/admin/users-table";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ForbiddenError, blockCaregiverRoute, isSuperuser } from "@/lib/rbac";

export default async function UsersPage() {
  await blockCaregiverRoute();
  const session = await auth();
  // OWNER and DEVELOPER (break-glass superuser) both manage admin-tier
  // accounts and can assign OWNER — see isSuperuser() in rbac.ts and the
  // matching server-side gate in src/lib/actions/users.ts.
  const canManageAdmins = isSuperuser(session?.user?.role);
  let users;
  try {
    users = await listUsers();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Users</h1>
          <PageInfoButton title="Users">
            <p>Manage everyone on staff — their name, email, login, role, and whether their account is active.</p>
            <p>
              Set each person&apos;s hourly pay rate here too — it&apos;s what turns their logged hours into a
              paycheck total on the{" "}
              <Link href="/time" className="inline-flex items-center gap-0.5 underline">
                Time <ArrowUpRight className="size-3" />
              </Link>{" "}
              page.
            </p>
          </PageInfoButton>
        </div>
        <NewUserDialog canAssignAdmin={canManageAdmins} />
      </div>
      <UsersTable users={users} currentUserId={session?.user?.id} canManageAdmins={canManageAdmins} />
    </div>
  );
}
