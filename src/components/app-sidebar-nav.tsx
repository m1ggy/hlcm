"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, KanbanSquare, CalendarDays, Building2, FolderKanban, Users, ClipboardList, UserCog, CheckSquare, Clock, Timer, Receipt, Settings, Inbox, MapPin, CalendarCheck, BarChart3, Sun, Wallet } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const LINKS = [
  { href: "/projects", label: "Projects", icon: FolderKanban, tour: "nav-projects" },
  { href: "/clients", label: "Clients", icon: Users, tour: "nav-clients" },
  { href: "/applications", label: "Applications", icon: ClipboardList, tour: "nav-applications" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, tour: "nav-tasks" },
  // Projects and tasks (docs/workspace-tasks-plan.md): general work, not licensing.
  { href: "/work", label: "Work", icon: KanbanSquare, tour: "nav-work" },
  { href: "/form-submissions", label: "Form Submissions", icon: Inbox, tour: "nav-form-submissions" },
  { href: "/leads", label: "Leads", icon: CalendarCheck, tour: "nav-leads" },
  { href: "/time", label: "Time", icon: Clock, tour: "nav-time" },
  { href: "/time-tracking", label: "Time Tracking", icon: Timer, tour: "nav-time-tracking" },
  { href: "/reports", label: "Reports", icon: BarChart3, tour: "nav-reports" },
];

// Caregiver-restricted set — no Projects/Applications/Time/Invoices/Admin,
// same scope the role is limited to everywhere else (see src/lib/rbac.ts,
// src/lib/actions/clients.ts, src/lib/actions/care-recipients.ts). Today
// first: it's their home screen. Clients only when they actually have any
// (it's derived from licensing tasks most hands-on caregivers never get).
const CAREGIVER_LINKS = [
  { href: "/today", label: "Today", icon: Sun, tour: "nav-today" },
  { href: "/care-recipients", label: "My Recipients", icon: MapPin, tour: "nav-recipients" },
  { href: "/hours", label: "My Hours", icon: Clock, tour: "nav-hours" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, tour: "nav-tasks" },
  { href: "/clients", label: "Clients", icon: Users, tour: "nav-clients" },
  { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" },
];

export function AppSidebarNav({
  isAdmin,
  canManageInvoices,
  canViewPayroll = false,
  isCaregiver,
  showCaregiverClients = true,
  showClientWorkspaces = false,
  isTasksWorkspace = false,
  isWorkTeam = false,
}: {
  isAdmin: boolean;
  canManageInvoices: boolean;
  canViewPayroll?: boolean;
  isCaregiver: boolean;
  showCaregiverClients?: boolean;
  /** A managing company's admins and account managers (src/lib/workspace-assignments.ts). */
  showClientWorkspaces?: boolean;
  /** A client company's tasks-only workspace: no licensing pages. */
  isTasksWorkspace?: boolean;
  /** On the team side of a tasks-only workspace (a managing company's assigned staff). */
  isWorkTeam?: boolean;
}) {
  const pathname = usePathname();

  let links: typeof LINKS;
  if (isTasksWorkspace) {
    links = [
      { href: "/work/summary", label: "This week", icon: CalendarDays, tour: "nav-work-summary" },
      { href: "/work", label: "Projects", icon: LayoutList, tour: "nav-work" },
      ...(isWorkTeam ? [{ href: "/work/my", label: "My tasks", icon: CheckSquare, tour: "nav-work-my" }] : []),
      { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" },
    ];
    if (isAdmin) links = [...links, { href: "/admin/users", label: "Users", icon: UserCog, tour: "nav-admin" }];
  } else if (isCaregiver) {
    links = showCaregiverClients ? CAREGIVER_LINKS : CAREGIVER_LINKS.filter((l) => l.href !== "/clients");
  } else {
    links = canManageInvoices
      ? [...LINKS, { href: "/invoices", label: "Invoices", icon: Receipt, tour: "nav-invoices" }]
      : LINKS;
    if (canViewPayroll) links = [...links, { href: "/payroll", label: "Payroll", icon: Wallet, tour: "nav-payroll" }];
    if (showClientWorkspaces) links = [...links, { href: "/client-workspaces", label: "Client workspaces", icon: Building2, tour: "nav-client-workspaces" }];
    links = [...links, { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" }];
    if (isAdmin) links = [...links, { href: "/admin", label: "Admin", icon: UserCog, tour: "nav-admin" }];
  }

  return (
    <SidebarMenu>
      {links.map((link) => {
        const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
        const best = links.filter((l) => matches(l.href)).sort((a, b) => b.href.length - a.href.length)[0];
        const isActive = best?.href === link.href;
        return (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton isActive={isActive} render={<Link href={link.href} data-tour={link.tour} />}>
              <link.icon />
              <span>{link.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
