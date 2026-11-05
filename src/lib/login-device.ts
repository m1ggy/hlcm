import { db } from "@/lib/db";

export type LoginDeviceType = "DESKTOP" | "MOBILE" | "TABLET";

export type LoginDevice = {
  deviceType: LoginDeviceType;
  browser: string | null;
  os: string | null;
  userAgent: string | null;
  ipAddress: string | null;
};

export const MOBILE_BLOCKED_MESSAGE =
  "Sign-in from a phone or tablet is turned off for your account. Please use a computer.";

/**
 * Best-guess device/browser/OS from request headers — no library, just the
 * common cases. User-Agent can be faked (and "Request desktop site" on a
 * phone sends a desktop one), so treat this as a strong hint, not proof.
 * iPadOS Safari reports itself as a Mac by default, so most iPads show as
 * DESKTOP.
 */
export function parseLoginDevice(headers: Headers): LoginDevice {
  const ua = headers.get("user-agent") ?? "";
  const chMobile = headers.get("sec-ch-ua-mobile") === "?1";

  let deviceType: LoginDeviceType = "DESKTOP";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = "TABLET";
  } else if (chMobile || /Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = "MOBILE";
  }

  return {
    deviceType,
    browser: parseBrowser(ua),
    os: parseOs(ua),
    userAgent: ua ? ua.slice(0, 500) : null,
    ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null,
  };
}

function parseBrowser(ua: string): string | null {
  // Order matters: Edge/Opera/Samsung all also say "Chrome", and Chrome also says "Safari".
  const rules: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//, "Edge"],
    [/OPR\/|Opera/, "Opera"],
    [/SamsungBrowser\//, "Samsung Internet"],
    [/CriOS\//, "Chrome"],
    [/FxiOS\//, "Firefox"],
    [/Firefox\//, "Firefox"],
    [/Chrome\//, "Chrome"],
    [/Safari\//, "Safari"],
  ];
  return rules.find(([re]) => re.test(ua))?.[1] ?? null;
}

function parseOs(ua: string): string | null {
  const rules: [RegExp, string][] = [
    [/Windows/, "Windows"],
    [/iPhone|iPod/, "iOS"],
    [/iPad/, "iPadOS"],
    [/Android/, "Android"],
    [/CrOS/, "ChromeOS"],
    [/Mac OS X|Macintosh/, "macOS"],
    [/Linux/, "Linux"],
  ];
  return rules.find(([re]) => re.test(ua))?.[1] ?? null;
}

export function isMobileDevice(deviceType: LoginDeviceType | string | null | undefined): boolean {
  return deviceType === "MOBILE" || deviceType === "TABLET";
}

export async function recordLoginEvent(params: {
  userId: string;
  device: LoginDevice;
  success: boolean;
  method: "password" | "password+mfa" | "support" | "switch";
  reason?: string;
}) {
  try {
    await db.loginEvent.create({
      data: {
        userId: params.userId,
        success: params.success,
        method: params.method,
        reason: params.reason,
        deviceType: params.device.deviceType,
        browser: params.device.browser,
        os: params.device.os,
        userAgent: params.device.userAgent,
        ipAddress: params.device.ipAddress,
      },
    });
  } catch (error) {
    // Logging a sign-in must never be the reason a sign-in fails.
    console.error("Failed to record login event", error);
  }
}

/** True when this user may not sign in from this device (and logs the refusal). */
export async function refuseIfMobileBlocked(
  user: { id: string; mobileLoginBlocked: boolean },
  device: LoginDevice,
  method: "password" | "password+mfa" | "switch"
): Promise<boolean> {
  if (!user.mobileLoginBlocked || !isMobileDevice(device.deviceType)) return false;
  await recordLoginEvent({ userId: user.id, device, success: false, method, reason: "mobile_blocked" });
  return true;
}
