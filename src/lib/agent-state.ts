import { db } from "@/lib/db";
import { findOpenBreak, findOpenEntry } from "@/lib/time-clock";
import { currentMonitoring } from "@/lib/activity-monitoring";

/** No keyboard or mouse input for this long and the app clocks the person out (scope v2). */
export const AUTO_CLOCK_OUT_IDLE_MINUTES = 120;

/** Whether this user has accepted this policy version. */
export async function hasConsent(userId: string, policyVersion: string) {
  const consent = await db.monitoringConsent.findUnique({
    where: { userId_policyVersion: { userId, policyVersion } },
    select: { id: true },
  });
  return !!consent;
}

/**
 * What the desktop app needs to render its tray and decide whether to keep
 * tracking. Returned by /me, /clock and /heartbeat, so a clock-out made on
 * the web (or a server auto clock-out) reaches the app within a minute.
 * `trackingThisDevice` is false when the open session belongs to another
 * device or the web clock: the app shows it but doesn't capture.
 */
export async function clockState(userId: string, deviceId: string) {
  const { policy } = await currentMonitoring();
  const [openEntry, openBreak, consented] = await Promise.all([
    findOpenEntry(userId),
    findOpenBreak(userId),
    hasConsent(userId, policy.version),
  ]);
  return {
    serverTime: new Date().toISOString(),
    status: openEntry ? "CLOCKED_IN" : openBreak ? "ON_BREAK" : "CLOCKED_OUT",
    openEntry: openEntry && {
      id: openEntry.id,
      clockIn: openEntry.clockIn.toISOString(),
      source: openEntry.source,
      trackingThisDevice: openEntry.source === "AGENT" && openEntry.agentDeviceId === deviceId,
    },
    openBreak: openBreak && { id: openBreak.id, breakStart: openBreak.breakStart.toISOString() },
    policy: { version: policy.version, text: policy.text, accepted: consented },
    autoClockOutIdleMinutes: AUTO_CLOCK_OUT_IDLE_MINUTES,
  };
}
