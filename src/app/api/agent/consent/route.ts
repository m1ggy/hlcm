import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";
import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { clockState } from "@/lib/agent-state";
import { currentMonitoring } from "@/lib/activity-monitoring";

const body = z.object({ policyVersion: z.string().min(1).max(100) });

/** Records the user accepting the monitoring notice the app just showed them. */
export async function POST(request: Request) {
  return agentJson(async () => {
    const { user, device, ip } = await authenticateAgent(request);
    const { policyVersion } = body.parse(await request.json());
    // The app must echo the version it displayed; accepting stale text
    // doesn't count as accepting the current notice.
    if (policyVersion !== (await currentMonitoring()).policy.version) throw new UserFacingError("The notice has been updated. Please review it again.");

    const consent = await db.monitoringConsent.upsert({
      where: { userId_policyVersion: { userId: user.id, policyVersion } },
      create: { userId: user.id, policyVersion, ipAddress: ip, deviceId: device.id },
      update: {},
    });
    await recordAudit({
      entityType: "MonitoringConsent",
      entityId: consent.id,
      action: "accept_monitoring_policy",
      actorId: user.id,
      newValue: policyVersion,
      ipAddress: ip,
    });
    return clockState(user.id, device.id);
  });
}
