"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Users, ClipboardList, UserCog, CheckSquare, Clock, Receipt, Settings } from "lucide-react";
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
  { href: "/time", label: "Time", icon: Clock, tour: "nav-time" },
];

export function AppSidebarNav({ isAdmin, canManageInvoices }: { isAdmin: boolean; canManageInvoices: boolean }) {
  const pathname = usePathname();
  let links = canManageInvoices
    ? [...LINKS, { href: "/invoices", label: "Invoices", icon: Receipt, tour: "nav-invoices" }]
    : LINKS;
  links = [...links, { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" }];
  if (isAdmin) links = [...links, { href: "/admin", label: "Admin", icon: UserCog, tour: "nav-admin" }];

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
