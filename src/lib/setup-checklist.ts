import { currentOrganization, db } from "@/lib/db";
import { isIntegrationConfigured } from "@/lib/integrations";
import { isSetupChecklistDismissed } from "@/lib/tenant";

export { dismissSetupChecklist } from "@/lib/tenant";

// The dashboard's "Set up your workspace" card for a new workspace's owner
// (src/components/dashboard/setup-checklist.tsx). Each step is worked out
// from what's actually in the workspace, so it ticks itself off; the card
// goes away once the owner dismisses it. Existing workspaces were marked
// dismissed by the migration that added it.

export type SetupStep = { id: string; title: string; description: string; href: string; done: boolean };

/** The steps, or null once the checklist has been dismissed. */
export async function getSetupChecklist(): Promise<SetupStep[] | null> {
  const org = await currentOrganization();
  if (await isSetupChecklistDismissed(org.id)) return null;

  const [userCount, stripeConnected, projectCount] = await Promise.all([
    db.user.count({ where: { active: true } }),
    isIntegrationConfigured("STRIPE"),
    db.project.count(),
  ]);

  return [
    {
      id: "organization",
      title: "Set your timezone and reply-to email",
      description: "When the daily digest goes out, the time clock's default zone, and where replies to your emails land.",
      href: "/admin/organization",
      done: Boolean(org.timezone && org.replyToEmail),
    },
    {
      id: "team",
      title: "Invite your team",
      description: "Add the people who'll work cases with you — each gets an email to set their password.",
      href: "/admin/users",
      done: userCount > 1,
    },
    {
      id: "stripe",
      title: "Connect Stripe",
      description: "Needed to send invoices. Calendly, DocuSign and the rest are optional, on the same page.",
      href: "/admin/integrations",
      done: stripeConnected,
    },
    {
      id: "lists",
      title: "Review license types and checklists",
      description: "Your workspace starts with a standard set of license types, checklists and pipeline stages — adjust them to how you work.",
      href: "/admin/license-types",
      done: false,
    },
    {
      id: "project",
      title: "Create your first project",
      description: "Projects group related licensing work; clients and their cases live under them.",
      href: "/projects",
      done: projectCount > 0,
    },
  ];
}
