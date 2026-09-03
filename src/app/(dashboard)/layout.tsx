import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchBox } from "@/components/search-box";
import { CommandPalette } from "@/components/command-palette";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { ProductTour } from "@/components/tour/product-tour";
import { TimeClockWidget } from "@/components/time-clock/time-clock-widget";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { getMyActiveEntry, getMyActiveBreak } from "@/lib/actions/time-entries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role === "CLIENT") redirect("/portal");
  const [activeEntry, activeBreak] = await Promise.all([getMyActiveEntry(), getMyActiveBreak()]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <SearchBox />
          </div>
          <div className="flex items-center gap-1">
            <TimeClockWidget
              initialClockIn={activeEntry ? activeEntry.clockIn.toISOString() : null}
              initialBreakStart={activeBreak ? activeBreak.breakStart.toISOString() : null}
            />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              data-tour="handbook-link"
              render={<a href="/handbook" target="_blank" rel="noopener noreferrer" />}
            >
              <BookOpen className="size-3.5" /> Handbook
            </Button>
            <ProductTour role={session?.user?.role} />
            <NotificationBell />
          </div>
        </header>
        <main className="w-full flex-1 px-4 py-6 md:px-6">{children}</main>
      </SidebarInset>
      <CommandPalette isAdmin={session?.user?.role === "ADMIN"} />
      <GlobalShortcuts />
    </SidebarProvider>
  );
}
