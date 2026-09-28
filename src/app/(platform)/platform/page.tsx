import Link from "next/link";
import { listOrganizationsForPlatform, platformAdminHasMfa } from "@/lib/actions/platform";
import { PlatformOrganizations } from "@/components/platform/platform-organizations";

export default async function PlatformPage() {
  if (!(await platformAdminHasMfa())) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Turn on two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">
          The platform console can create and suspend every workspace, so it requires two-factor authentication.
        </p>
        <Link href="/platform/account" className="text-sm font-medium underline">
          Set it up on your account page
        </Link>
      </div>
    );
  }
  const organizations = await listOrganizationsForPlatform();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="text-sm text-muted-foreground">
          Each organization is an isolated workspace at its own address. New ones start with a copy of the template
          workspace&apos;s setup, and their owner gets an emailed invite.
        </p>
      </div>
      <PlatformOrganizations organizations={organizations} />
    </div>
  );
}
