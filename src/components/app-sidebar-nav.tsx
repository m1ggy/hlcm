"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Users, ClipboardList, UserCog, CheckSquare } from "lucide-react";
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
];

export function AppSidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin", icon: UserCog, tour: "nav-admin" }] : LINKS;

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
