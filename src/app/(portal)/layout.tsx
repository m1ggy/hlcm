import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getAccount } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { EmailNotificationsToggle } from "@/components/account/email-notifications-toggle";
import { ProductTour } from "@/components/tour/product-tour";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CLIENT") redirect("/");

  const account = await getAccount();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b px-4 py-3 md:px-6">
        <Link href="/portal" className="shrink-0 text-lg font-semibold tracking-tight">
          <span className="sm:hidden">HCLM</span>
          <span className="hidden sm:inline">HCLM Client Portal</span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <EmailNotificationsToggle initialEnabled={account.emailNotificationsEnabled} />
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
          <NotificationBell variant="portal" />
          <div className="hidden sm:block">
            <ProductTour role={session.user.role} />
          </div>
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
      <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
