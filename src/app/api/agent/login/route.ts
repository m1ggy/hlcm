import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, currentOrg } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { createMfaChallenge, verifyMfaChallenge } from "@/lib/mfa-challenge";
import { verifyTotpToken } from "@/lib/totp";
import { clearLoginFailures, isLoginThrottled, recordLoginFailure } from "@/lib/login-throttle";
import { loginKeyOf, parseLoginIdentifier, pickLoginUser } from "@/lib/login-identifier";
import { recordLoginEvent, type LoginDevice } from "@/lib/login-device";
import { AgentAuthError, agentJson, assertAgentAllowed, clientIp, registerDevice } from "@/lib/agent-auth";

// Desktop app sign-in, against the workspace whose address the app uses,
// with the same rules as the web /login (email or phone, throttling, MFA in
// two steps): 1) identifier + password -> tokens, or { mfaRequired, challenge };
// 2) challenge + otp -> tokens. Each successful sign-in registers a new
// AgentDevice and shows in the person's sign-in history as "Desktop app".
// The mobile sign-in block doesn't apply: this is a computer.

const device = z.object({
  name: z.string().trim().min(1).max(100),
  os: z.enum(["win32", "darwin"]),
  appVersion: z.string().trim().min(1).max(40),
});

const body = z.union([
  z.object({ email: z.string().trim().max(320), password: z.string().min(1).max(200), device }),
  z.object({ challenge: z.string().min(1).max(2000), otp: z.string().trim().min(6).max(10), device }),
]);

const INVALID = "Invalid email or password";

function loginDevice(request: Request, d: z.infer<typeof device>): LoginDevice {
  return {
    deviceType: "DESKTOP",
    browser: `Carenela desktop app ${d.appVersion}`,
    os: d.os === "darwin" ? "macOS" : "Windows",
    userAgent: request.headers.get("user-agent"),
    ipAddress: clientIp(request),
  };
}

export async function POST(request: Request) {
  return agentJson(async () => {
    const ip = clientIp(request);
    const org = await currentOrg();
    const input = body.parse(await request.json());

    let userId: string;
    let method: "desktop_app" | "desktop_app+mfa";
    if ("challenge" in input) {
      const challengedId = await verifyMfaChallenge(input.challenge);
      const user = challengedId ? await db.user.findUnique({ where: { id: challengedId } }) : null;
      if (!user || !user.active || user.isSupport || !user.mfaEnabled || !user.mfaSecret) throw new AgentAuthError("Sign-in expired. Start again.");
      const key = loginKeyOf(user);
      if (isLoginThrottled(ip, org.id, key)) throw new AgentAuthError("Too many sign-in attempts. Try again in a few minutes.", 429);
      if (!verifyTotpToken(input.otp, user.mfaSecret)) {
        recordLoginFailure(ip, org.id, key);
        throw new AgentAuthError("Invalid code");
      }
      await assertAgentAllowed(user);
      clearLoginFailures(org.id, key);
      userId = user.id;
      method = "desktop_app+mfa";
    } else {
      const identifier = parseLoginIdentifier(input.email);
      if (!identifier) throw new AgentAuthError(INVALID);
      if (isLoginThrottled(ip, org.id, identifier.key)) throw new AgentAuthError("Too many sign-in attempts. Try again in a few minutes.", 429);
      const user = pickLoginUser(await db.user.findMany({ where: identifier.where, take: 2 }));
      const passwordValid = user?.active && !user.isSupport ? await bcrypt.compare(input.password, user.passwordHash) : false;
      if (!user || !passwordValid) {
        recordLoginFailure(ip, org.id, identifier.key);
        throw new AgentAuthError(INVALID);
      }
      // Checked only after the password is proven, so this can't be used to
      // learn anything about an account.
      await assertAgentAllowed(user);
      clearLoginFailures(org.id, identifier.key);
      if (user.mfaEnabled) return { mfaRequired: true, challenge: await createMfaChallenge(user.id) };
      userId = user.id;
      method = "desktop_app";
    }

    const tokens = await registerDevice(userId, input.device, ip);
    await recordLoginEvent({ userId, device: loginDevice(request, input.device), success: true, method });
    await recordAudit({
      entityType: "AgentDevice",
      entityId: tokens.deviceId,
      action: "agent_sign_in",
      actorId: userId,
      newValue: `${input.device.name} (${input.device.os}, v${input.device.appVersion})`,
      ipAddress: ip,
    });
    return tokens;
  });
}
