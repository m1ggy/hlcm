import Link from "next/link";
import { auth, signOut } from "@/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export async function AppSidebar() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          HCLM
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <AppSidebarNav isAdmin={session.user.role === "ADMIN"} />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link href="/account" className="block truncate text-sm hover:underline">
              {session.user.email}
            </Link>
            <p className="text-xs text-muted-foreground">{session.user.role}</p>
          </div>
          <ThemeToggle />
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
