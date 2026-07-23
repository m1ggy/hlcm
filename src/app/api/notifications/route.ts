import { NextResponse } from "next/server";
import { listNotifications, countUnreadNotifications } from "@/lib/actions/notifications";
import { UnauthorizedError } from "@/lib/rbac";

// Plain API route instead of Server Actions — this is a periodic background
// poll (setInterval), not a user-triggered mutation. Routing it through
// Next's Server Action dispatch was found to occasionally desync the App
// Router's client-side route tree, causing an in-progress page to snap back
// to a parent route out from under the user. A plain fetch has no such
// interaction with client-side routing.
export async function GET() {
  try {
    const [count, notifications] = await Promise.all([countUnreadNotifications(), listNotifications()]);
    return NextResponse.json({ count, notifications });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw error;
  }
}
