"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Clock, MapPin, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// Phone-only tab bar for Caregivers. Their screens are built for phones, but
// switching pages meant opening the sidebar menu every time. The sidebar
// stays for everything else (Clients, Settings); this covers the four pages
// they move between during a day. Hidden from md up, where the sidebar shows.
const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/care-recipients", label: "Recipients", icon: MapPin },
  { href: "/hours", label: "Hours", icon: Clock },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
];

export function CaregiverBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {/* Lift bottom toasts above the bar. Rendered only with the bar, so it
          never moves toasts for other roles. */}
      <style>{`@media (max-width: 767px) { [data-sonner-toaster][data-y-position="bottom"] { bottom: calc(4.5rem + env(safe-area-inset-bottom)) !important; } }`}</style>
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className="size-5" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
