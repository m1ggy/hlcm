import Link from "next/link";
import { auth } from "@/auth";
import { blockCaregiverRoute, isSuperuser } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_LINKS = [
  { href: "/admin/organization", label: "Organization", description: "This workspace's name and timezone (owners only)" },
  { href: "/admin/users", label: "Users", description: "Manage staff accounts and roles" },
  { href: "/admin/license-types", label: "License Types", description: "The licenses your clients apply for, and their pipelines" },
  { href: "/admin/case-types", label: "Case Types", description: "New, Renewal, Post-License, Change of Ownership" },
  { href: "/admin/lists", label: "Lists", description: "Agencies, MCOs/payers and \"ball is with\" choices" },
  { href: "/admin/integrations", label: "Integrations", description: "Connect Stripe, DocuSign, Calendly, Wise, Twilio and Teams (owners only)" },
  { href: "/admin/checklist-templates", label: "Checklist Templates", description: "Checklist items cloned onto new Applications" },
  { href: "/admin/document-templates", label: "Document Templates", description: "Merge-tag handbooks and policies generated per client" },
  { href: "/admin/invoice-profiles", label: "Invoice Profiles", description: "Billing identities (logo, CC recipients, footer text) for manual invoices" },
  { href: "/admin/client-groups", label: "Client Groups", description: "Bundle related clients into one section on the Invoices page" },
  { href: "/intake/forms", label: "Forms", description: "Public intake forms — now under Forms in the sidebar" },
];

// Monitoring data is OWNER/DEVELOPER only (docs/activity-monitoring-plan.md).
const ACTIVITY_LINK = { href: "/admin/activity", label: "Activity", description: "Desktop app tracking: who is working, screenshots, app usage and productivity rules" };

export default async function AdminPage() {
  await blockCaregiverRoute();
  const session = await auth();
  const links = isSuperuser(session?.user?.role) ? [ACTIVITY_LINK, ...ADMIN_LINKS] : ADMIN_LINKS;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((link) => (
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
