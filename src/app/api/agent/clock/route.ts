import { z } from "zod";
import { UserFacingError } from "@/lib/user-facing-error";
import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { clockState, hasConsent } from "@/lib/agent-state";
import { currentMonitoring } from "@/lib/activity-monitoring";
import { clockInFor, clockOutFor, endBreakFor, endBreakForDayFor, startBreakFor } from "@/lib/time-clock";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("in") }),
  // `at`: the 2-hour no-input auto clock-out ends the session when input
  // stopped. Omitted = now.
  z.object({ action: z.literal("out"), at: z.iso.datetime().optional() }),
  z.object({ action: z.literal("break-start") }),
  z.object({ action: z.literal("break-end") }),
  z.object({ action: z.literal("break-end-day") }),
]);

export async function POST(request: Request) {
  return agentJson(async () => {
    const { user, device } = await authenticateAgent(request);
    const input = body.parse(await request.json());
    const origin = { source: "AGENT" as const, agentDeviceId: device.id };

    // Anything that starts tracked time needs the current notice accepted.
    if ((input.action === "in" || input.action === "break-end") && !(await hasConsent(user.id, (await currentMonitoring()).policy.version))) {
      throw new UserFacingError("Accept the monitoring notice before clocking in");
    }

    switch (input.action) {
      case "in":
        await clockInFor(user.id, {}, origin);
        break;
      case "out":
        await clockOutFor(user.id, { at: input.at ? new Date(input.at) : undefined });
        break;
      case "break-start":
        await startBreakFor(user.id);
        break;
      case "break-end":
        await endBreakFor(user.id, origin);
        break;
      case "break-end-day":
        await endBreakForDayFor(user.id);
        break;
    }
    return clockState(user.id, device.id);
  });
}
