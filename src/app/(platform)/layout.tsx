import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { isPlatformAdmin } from "@/lib/tenant-host";
import { PRODUCT_NAME } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

// The platform console's own chrome — deliberately not the CRM sidebar:
// platform admins manage workspaces, not cases. Only reachable on the
// platform org's host (admin.<ROOT_DOMAIN>) by its DEVELOPERs (superadmins).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isPlatformAdmin(session.user)) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <Link href="/platform" className="flex items-center gap-3" aria-label={`${PRODUCT_NAME} platform`}>
          <BrandLogo className="h-7" />
          <span className="font-heading text-lg font-semibold tracking-tight text-muted-foreground">Platform</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/platform/account" className="text-sm hover:underline">
            Account
          </Link>
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
          <ThemeToggle />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
