import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHostOrg, getOrgBySlug } from "@/lib/tenant";
import { isValidOrgSlug, orgAppUrl } from "@/lib/tenant-host";
import { PRODUCT_NAME } from "@/lib/branding";
import { linkedHomeSlug } from "@/lib/linked-home";
import { returnPathFromCallback, safeSwitchPath, switchBackPath } from "@/lib/workspace-switch";
import { LoginForm, type ReturnTo } from "./login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";

type Params = { callbackUrl?: string; workspace?: string; next?: string; direct?: string };

// Titled with the workspace being signed in to (the request host's
// organization), so people can tell which one they're on.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const org = await getHostOrg();
  // No workspace at this address (the bare root domain, an unknown
  // subdomain): there's nothing to sign in to here — help find the right one.
  if (!org && process.env.ROOT_DOMAIN) redirect("/find-workspace");
  if (org?.status === "SUSPENDED") return <WorkspaceSuspended name={org.name} />;

  if (org?.status === "ACTIVE") {
    // Staff from the managing company, signed out of a client workspace:
    // their account here has no password, so they sign in at home and come
    // straight back to the page they were on (src/lib/linked-home.ts).
    // `direct` is the way out for someone with their own account here.
    const homeSlug = params.direct ? null : await linkedHomeSlug();
    if (homeSlug && homeSlug !== org.slug && (await getOrgBySlug(homeSlug))?.status === "ACTIVE") {
      const next = returnPathFromCallback(params.callbackUrl);
      redirect(`${orgAppUrl(homeSlug)}/login?workspace=${encodeURIComponent(org.slug)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }

    // The home side of that: once signed in here, go back to that workspace.
    const returnTo = await returnTarget(params, org.slug);
    if (returnTo) {
      const session = await auth();
      if (session?.user?.orgSlug === org.slug) redirect(switchBackPath(returnTo.slug, returnTo.next));
      return <LoginForm title={`${org.name} — Sign in`} returnTo={returnTo} />;
    }
  }

  return <LoginForm title={`${org?.status === "ACTIVE" ? org.name : PRODUCT_NAME} — Sign in`} />;
}

async function returnTarget(params: Params, hereSlug: string): Promise<ReturnTo | null> {
  const slug = params.workspace;
  if (!slug || slug === hereSlug || !isValidOrgSlug(slug)) return null;
  const target = await getOrgBySlug(slug);
  if (target?.status !== "ACTIVE") return null;
  return { slug, name: target.name, next: safeSwitchPath(params.next), directUrl: `${orgAppUrl(slug)}/login?direct=1` };
}

function WorkspaceSuspended({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <BrandLogo />
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
