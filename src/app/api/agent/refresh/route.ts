import { z } from "zod";
import { agentJson, clientIp, refreshDevice } from "@/lib/agent-auth";

const body = z.object({
  deviceId: z.string().min(1).max(64),
  refreshToken: z.string().min(1).max(200),
  appVersion: z.string().trim().min(1).max(40).optional(),
});

/** Trades a refresh token for a new access + refresh token pair (rotation). */
export async function POST(request: Request) {
  return agentJson(async () => {
    const input = body.parse(await request.json());
    return refreshDevice(input.deviceId, input.refreshToken, { appVersion: input.appVersion }, clientIp(request));
  });
}
