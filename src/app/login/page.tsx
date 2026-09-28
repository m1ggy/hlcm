import { redirect } from "next/navigation";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Titled with the workspace being signed in to (the request host's
// organization), so people can tell which one they're on.
export default async function LoginPage() {
  const org = await getHostOrg();
  // No workspace at this address (the bare root domain, an unknown
  // subdomain): there's nothing to sign in to here — help find the right one.
  if (!org && process.env.ROOT_DOMAIN) redirect("/find-workspace");
  if (org?.status === "SUSPENDED") return <WorkspaceSuspended name={org.name} />;
  return <LoginForm title={`${org?.status === "ACTIVE" ? org.name : PRODUCT_NAME} — Sign in`} />;
}

function WorkspaceSuspended({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>This workspace is currently suspended, so nobody can sign in to it.</p>
          <p className="text-muted-foreground">If you think this is a mistake, contact your organization&apos;s administrator.</p>
        </CardContent>
      </Card>
    </div>
  );
}
