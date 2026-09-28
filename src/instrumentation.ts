// Runs once when the server process starts (see
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
// This app runs as a single always-on Docker/Node process, not serverless,
// so an in-process interval is the simplest way to run scheduled work — no
// extra container, secret, or external scheduler needed.

import type { Instrumentation } from "next";
import { orgSlugFromHost } from "@/lib/tenant-host";

const DIGEST_HOUR = 8; // in each organization's own timezone (server's if unset)

// Per organization: the local date its digest last went out, so each org
// gets one digest a day at 8am *its* time, checked hourly.
const lastSentDate = new Map<string, string>();

function localHourAndDate(timezone: string | null, now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

async function maybeSendDigest() {
  const { sendDueDateDigests } = await import("@/lib/due-date-digest");
  const { forEachActiveOrg } = await import("@/lib/db");
  const now = new Date();
  try {
    // Each org's data lives behind its own tenant scope (src/lib/db.ts) —
    // there's no request host here, so run the job once per org.
    await forEachActiveOrg("Due-date digest", async (org) => {
      const { hour, date } = localHourAndDate(org.timezone, now);
      if (hour < DIGEST_HOUR || lastSentDate.get(org.id) === date) return;
      lastSentDate.set(org.id, date);
      await sendDueDateDigests();
    });
  } catch (error) {
    console.error("Due-date digest run failed:", error);
  }
}

// Unlike the digest above (once a day, a single lastSentDate flag), meeting
// reminders are due at a different moment per Lead — dedupe lives on each
// Lead row itself (reminder24hSentAt/reminder30mSentAt), not here. This just
// needs to poll often enough that a 30-minutes-before reminder is still
// timely; no per-run state to track in this file at all.
async function tickMeetingReminders() {
  const { sendMeetingReminders } = await import("@/lib/meeting-reminders");
  const { forEachActiveOrg } = await import("@/lib/db");
  try {
    await forEachActiveOrg("Meeting reminders", () => sendMeetingReminders());
  } catch (error) {
    console.error("Meeting reminder run failed:", error);
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  setInterval(maybeSendDigest, 60 * 60 * 1000);
  setInterval(tickMeetingReminders, 5 * 60 * 1000);
}

// Next logs the error itself; this adds which tenant it happened in (from
// the request host — the same rule src/lib/tenant.ts uses), so an incident
// can be traced to one org. The digest ties it to what the user saw.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const hostHeader = request.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  const message = err instanceof Error ? err.message || err.name : String(err);
  console.error(
    `[tenant ${orgSlugFromHost(host) ?? "none"}] ${context.routeType} ${request.method} ${request.path} failed` +
      `${digest ? ` (digest ${digest})` : ""}: ${message}`
  );
};
