import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { clockState } from "@/lib/agent-state";

export async function GET(request: Request) {
  return agentJson(async () => {
    const { user, device } = await authenticateAgent(request);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, timezone: user.timezone },
      device: { id: device.id, name: device.name },
      ...(await clockState(user.id, device.id)),
    };
  });
}
