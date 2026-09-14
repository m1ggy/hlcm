// Runs once when the server process starts (see
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
// This app runs as a single always-on Docker/Node process, not serverless,
// so an in-process interval is the simplest way to run scheduled work — no
// extra container, secret, or external scheduler needed.

const DIGEST_HOUR = 8; // local server time

let lastSentDate: string | null = null;

async function maybeSendDigest() {
  const now = new Date();
  if (now.getHours() < DIGEST_HOUR) return;

  const today = now.toDateString();
  if (lastSentDate === today) return;
  lastSentDate = today;

  const { sendDueDateDigests } = await import("@/lib/due-date-digest");
  try {
    await sendDueDateDigests();
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
  try {
    await sendMeetingReminders();
  } catch (error) {
    console.error("Meeting reminder run failed:", error);
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  setInterval(maybeSendDigest, 60 * 60 * 1000);
  setInterval(tickMeetingReminders, 5 * 60 * 1000);
}
