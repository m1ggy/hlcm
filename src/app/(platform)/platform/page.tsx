import { listOrganizationsForPlatform } from "@/lib/actions/platform";
import { PlatformOrganizations } from "@/components/platform/platform-organizations";

export default async function PlatformPage() {
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
