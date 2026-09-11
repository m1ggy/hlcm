import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchBox } from "@/components/search-box";
import { CommandPalette } from "@/components/command-palette";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { SessionExpiredDialog } from "@/components/auth/session-expired-dialog";
import { ProductTour } from "@/components/tour/product-tour";
import { TimeClockWidget } from "@/components/time-clock/time-clock-widget";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { getMyActiveEntry, getMyActiveBreak } from "@/lib/actions/time-entries";
import { listMyCareRecipients } from "@/lib/actions/care-recipients";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role === "CLIENT") redirect("/portal");
  const isCaregiver = session?.user?.role === "CAREGIVER";
  const [activeEntry, activeBreak, careRecipients] = await Promise.all([
    getMyActiveEntry(),
    getMyActiveBreak(),
    isCaregiver ? listMyCareRecipients() : Promise.resolve([]),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SidebarTrigger />
            <SearchBox />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <TimeClockWidget
              initialClockIn={activeEntry ? activeEntry.clockIn.toISOString() : null}
              initialBreakStart={activeBreak ? activeBreak.breakStart.toISOString() : null}
              initialCareRecipientId={activeEntry?.careRecipientId ?? null}
              isCaregiver={isCaregiver}
              careRecipients={careRecipients}
            />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              data-tour="handbook-link"
              render={<a href="/handbook" target="_blank" rel="noopener noreferrer" />}
            >
              <BookOpen className="size-3.5" /> <span className="hidden sm:inline">Handbook</span>
            </Button>
            <div className="hidden sm:block">
              <ProductTour role={session?.user?.role} />
            </div>
            <NotificationBell />
          </div>
        </header>
        <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
      </SidebarInset>
      <CommandPalette isAdmin={session?.user?.role === "ADMIN"} />
      <GlobalShortcuts />
      <SessionExpiredDialog />
    </SidebarProvider>
  );
}
