import { NextResponse } from "next/server";
import { getScreenshotForView } from "@/lib/activity-data";
import { signedReadUrl } from "@/lib/storage";
import { ForbiddenError, UnauthorizedError } from "@/lib/rbac";

// Screenshots hold whatever was on screen (often client PHI): the browser
// gets a 5-minute signed link to the private bucket after the access check,
// never a public or long-lived URL. Full-size views by anyone but the user
// are audited in getScreenshotForView.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const size = new URL(request.url).searchParams.get("size") === "full" ? "full" : "thumb";
    const key = await getScreenshotForView(id, size);
    const url = await signedReadUrl(key);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
