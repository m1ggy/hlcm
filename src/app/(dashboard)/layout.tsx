import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/rbac";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchBox } from "@/components/search-box";
import { CommandPalette } from "@/components/command-palette";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { SessionExpiredDialog } from "@/components/auth/session-expired-dialog";
import { ProductTour } from "@/components/tour/product-tour";
import { TimeClockWidget } from "@/components/time-clock/time-clock-widget";
import { CaregiverBottomNav } from "@/components/caregiver-bottom-nav";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { getMyActiveEntry, getMyActiveBreak } from "@/lib/actions/time-entries";
import { listMyStartableRecipients, getMyCurrentVisitRecipientId } from "@/lib/actions/visits";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role === "CLIENT") redirect("/portal");
  const isCaregiver = session?.user?.role === "CAREGIVER";
  const [activeEntry, activeBreak, careRecipients, visitRecipientId] = await Promise.all([
    getMyActiveEntry(),
    getMyActiveBreak(),
    isCaregiver ? listMyStartableRecipients() : Promise.resolve([]),
    isCaregiver ? getMyCurrentVisitRecipientId() : Promise.resolve(null),
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
              // Remount whenever the server-side clock state changes — the
              // widget seeds its state from these props once, so without
              // this a clock-in from the Today page would leave the header
              // showing "Clock in".
              key={`${activeEntry?.id ?? "-"}:${activeBreak?.id ?? "-"}`}
              initialClockIn={activeEntry ? activeEntry.clockIn.toISOString() : null}
              initialBreakStart={activeBreak ? activeBreak.breakStart.toISOString() : null}
              initialCareRecipientId={visitRecipientId}
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
        {/* Extra bottom padding on phones keeps content clear of the caregiver tab bar. */}
        <main className={`w-full min-w-0 flex-1 px-4 py-6 md:px-6 ${isCaregiver ? "pb-24 md:pb-6" : ""}`}>{children}</main>
        {isCaregiver && <CaregiverBottomNav />}
      </SidebarInset>
      <CommandPalette isAdmin={isAdmin(session?.user?.role)} />
      <GlobalShortcuts />
      <SessionExpiredDialog />
    </SidebarProvider>
  );
}
