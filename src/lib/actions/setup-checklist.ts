"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { currentOrgId } from "@/lib/db";
import { dismissSetupChecklist } from "@/lib/setup-checklist";

// Owners only — they're the ones who see the checklist (and can reach the
// Organization and Integrations pages it links to).
export async function dismissSetupChecklistAction() {
  await requireRole(["OWNER"]);
  await dismissSetupChecklist(await currentOrgId());
  revalidatePath("/");
}
