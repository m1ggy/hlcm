import { notFound, redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { isSuperuser } from "@/lib/rbac";
import { PLATFORM_SLUG } from "@/lib/tenant-host";
import { PRODUCT_NAME } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// The platform console's own chrome — deliberately not the CRM sidebar:
// platform admins manage workspaces, not cases. Only reachable on the
// platform org's host (admin.<ROOT_DOMAIN>) by its owners.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.orgSlug !== PLATFORM_SLUG || !isSuperuser(session.user.role)) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <span className="text-lg font-semibold tracking-tight">{PRODUCT_NAME} · Platform</span>
        <div className="flex items-center gap-3">
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
