import { z } from "zod";
import { db, currentOrg } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { consumePairingCode } from "@/lib/agent-pairing";
import { recordLoginEvent } from "@/lib/login-device";
import { AgentAuthError, agentJson, assertAgentAllowed, clientIp, registerDevice } from "@/lib/agent-auth";

// Desktop app sign-in from the web page's "Connect the app" button: the app
// trades the one-time code from the carenela:// link for its device tokens.
// The person already signed in on the web (with MFA if they use it) to get
// the code, so no password or MFA step here. Logged like /login, as
// "desktop_app_link".

const body = z.object({
  code: z.string().min(1).max(2000),
  device: z.object({
    name: z.string().trim().min(1).max(100),
    os: z.enum(["win32", "darwin"]),
    appVersion: z.string().trim().min(1).max(40),
  }),
});

const EXPIRED = "This connect link has expired or was already used. Click Connect on the web page again.";

export async function POST(request: Request) {
  return agentJson(async () => {
    const ip = clientIp(request);
    const org = await currentOrg();
    const input = body.parse(await request.json());

    const userId = await consumePairingCode(input.code, org.id);
    const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
    if (!user || !user.active || user.isSupport) throw new AgentAuthError(EXPIRED);
    await assertAgentAllowed(user);

    const tokens = await registerDevice(user.id, input.device, ip);
    await recordLoginEvent({
      userId: user.id,
      device: {
        deviceType: "DESKTOP",
        browser: `Carenela desktop app ${input.device.appVersion}`,
        os: input.device.os === "darwin" ? "macOS" : "Windows",
        userAgent: request.headers.get("user-agent"),
        ipAddress: ip,
      },
      success: true,
      method: "desktop_app_link",
    });
    await recordAudit({
      entityType: "AgentDevice",
      entityId: tokens.deviceId,
      action: "agent_sign_in",
      actorId: user.id,
      newValue: `${input.device.name} (${input.device.os}, v${input.device.appVersion}) via connect link`,
      ipAddress: ip,
    });
    return tokens;
  });
}
