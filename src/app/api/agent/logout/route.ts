import { recordAudit } from "@/lib/audit";
import { agentJson, authenticateAgent, revokeDevice } from "@/lib/agent-auth";

/** Signs this device out for good: its refresh token stops working. Does
 * not clock out; the app asks the user to clock out first. */
export async function POST(request: Request) {
  return agentJson(async () => {
    const { user, device, ip } = await authenticateAgent(request);
    await revokeDevice(device.id);
    await recordAudit({ entityType: "AgentDevice", entityId: device.id, action: "agent_sign_out", actorId: user.id, ipAddress: ip });
    return { ok: true };
  });
}
