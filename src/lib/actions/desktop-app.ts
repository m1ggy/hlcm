"use server";

import { db, currentOrg } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { assertAgentAllowed } from "@/lib/agent-auth";
import { createPairingCode } from "@/lib/agent-pairing";
import { getAppUrl } from "@/lib/email";

/**
 * The carenela:// link the "Connect the app" button opens: it carries this
 * workspace's address and a one-time code, so the desktop app signs in to
 * the right workspace as the person on the web page (src/lib/agent-pairing.ts).
 */
export async function createDesktopConnectLink() {
  return toActionResult(async () => {
    const session = await requireSession();
    if (session.user.isSupport) throw new UserFacingError("Support sign-ins can't connect the desktop app");
    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new UserFacingError("Sign in again");
    await assertAgentAllowed(user);
    const code = await createPairingCode(user.id, (await currentOrg()).id);
    const server = new URL(await getAppUrl()).origin;
    return `carenela://connect?server=${encodeURIComponent(server)}&code=${encodeURIComponent(code)}`;
  });
}
