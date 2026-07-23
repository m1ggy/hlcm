import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchBox } from "@/components/search-box";
import { CommandPalette } from "@/components/command-palette";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role === "CLIENT") redirect("/portal");

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <SearchBox />
          </div>
          <NotificationBell />
        </header>
        <main className="w-full flex-1 px-4 py-6 md:px-6">{children}</main>
      </SidebarInset>
      <CommandPalette isAdmin={session?.user?.role === "ADMIN"} />
      <GlobalShortcuts />
    </SidebarProvider>
  );
}
