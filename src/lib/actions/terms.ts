"use server";

import { redirect } from "next/navigation";
import { currentOrganization } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { recordTermsAcceptance } from "@/lib/tenant";
import { currentTerms } from "@/lib/terms";
import { homePathFor } from "@/lib/workspace-kind";

/** The owner accepts the current terms for the workspace (/accept-terms). */
export async function acceptTerms(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const terms = currentTerms();
  const home = homePathFor((await currentOrganization()).kind);
  if (!terms || session.user.isSupport) redirect(home);
  if (formData.get("agree") !== "on") redirect("/accept-terms?error=1");

  const org = await currentOrganization();
  const acceptedBy = `${session.user.name ?? ""} <${session.user.email ?? ""}>`.trim();
  await recordTermsAcceptance(org.id, terms.version, acceptedBy);
  await recordAudit({ entityType: "Organization", entityId: org.id, action: "accept_terms", actorId: session.user.id, newValue: terms.version });
  redirect(home);
}
