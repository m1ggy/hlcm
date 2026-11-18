import { db } from "@/lib/db";
import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { clockState } from "@/lib/agent-state";

/**
 * Sent once a minute while the app runs. Keeps this device's open session
 * alive (see closeSilentAgentSessions) and hands back the current clock
 * state, so the app notices a web clock-out or a server auto clock-out.
 */
export async function POST(request: Request) {
  return agentJson(async () => {
    const { user, device } = await authenticateAgent(request);
    await db.timeEntry.updateMany({
      where: { userId: user.id, clockOut: null, source: "AGENT", agentDeviceId: device.id },
      data: { lastHeartbeatAt: new Date() },
    });
    return clockState(user.id, device.id);
  });
}
