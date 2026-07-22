import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_LINKS = [
  { href: "/admin/users", label: "Users", description: "Manage staff accounts and roles" },
  { href: "/admin/license-types", label: "License Types", description: "CILA, IDPH, IDOA, etc." },
  { href: "/admin/case-types", label: "Case Types", description: "New, Renewal, Post-License, Change of Ownership" },
  { href: "/admin/checklist-templates", label: "Checklist Templates", description: "Checklist items cloned onto new Applications" },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ADMIN_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card>
              <CardHeader>
                <CardTitle>{link.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{link.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
