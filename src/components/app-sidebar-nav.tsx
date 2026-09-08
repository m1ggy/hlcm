"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Users, ClipboardList, UserCog, CheckSquare, Clock, Receipt, Settings, Inbox } from "lucide-react";
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
  { href: "/admin/forms/inbox", label: "Form Submissions", icon: Inbox, tour: "nav-form-submissions" },
  { href: "/time", label: "Time", icon: Clock, tour: "nav-time" },
];

// Caregiver-restricted set — no Projects/Applications/Time/Invoices/Admin,
// same "My Tasks" + "Clients" + "Settings" trio the role is scoped to
// everywhere else (see src/lib/rbac.ts, src/lib/actions/clients.ts).
const CAREGIVER_LINKS = [
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, tour: "nav-tasks" },
  { href: "/clients", label: "Clients", icon: Users, tour: "nav-clients" },
  { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" },
];

export function AppSidebarNav({
  isAdmin,
  canManageInvoices,
  isCaregiver,
}: {
  isAdmin: boolean;
  canManageInvoices: boolean;
  isCaregiver: boolean;
}) {
  const pathname = usePathname();

  let links: typeof LINKS;
  if (isCaregiver) {
    links = CAREGIVER_LINKS;
  } else {
    links = canManageInvoices
      ? [...LINKS, { href: "/invoices", label: "Invoices", icon: Receipt, tour: "nav-invoices" }]
      : LINKS;
    links = [...links, { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" }];
    if (isAdmin) links = [...links, { href: "/admin", label: "Admin", icon: UserCog, tour: "nav-admin" }];
  }

  return (
    <SidebarMenu>
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
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
