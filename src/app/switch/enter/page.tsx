import { getHostOrg } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SwitchEnterForm } from "@/components/workspaces/switch-enter-form";

// Where the workspace switcher lands (src/lib/workspace-switch.ts). The form
// submits itself on load; the button is the fallback with scripts off. A
// POST either way, so nothing that merely fetches the URL can use the link.
export default async function SwitchEnterPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const org = await getHostOrg();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Opening {org?.name ?? "this workspace"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {error || !token ? (
            <p>
              This link has expired or was already used. Go back to the workspace you came from and pick this one from
              the workspace switcher again.
            </p>
          ) : (
            <SwitchEnterForm token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
