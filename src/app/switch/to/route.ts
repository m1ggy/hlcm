import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getHostOrg } from "@/lib/tenant";
import { orgAppUrl } from "@/lib/tenant-host";
import { homePathForRole } from "@/lib/workspace-kind";
import { startWorkspaceSwitch } from "@/lib/workspace-switch";

// Back into a client workspace after signing in to the home workspace again
// (src/lib/linked-home.ts): `/switch/to?workspace=<slug>&next=<path>` on the
// home host trades the fresh session for a one-time switch link, the same
// one the workspace switcher gives. Behind the normal sign-in (not a public
// path). If the switch is refused (unassigned, workspace suspended), the
// person just stays home.
export async function GET(request: NextRequest) {
  const org = await getHostOrg();
  const session = await auth();
  if (!org) return NextResponse.redirect(new URL("/login", request.url));
  const base = orgAppUrl(org.slug);
  if (!session?.user) return NextResponse.redirect(`${base}/login`);
  const slug = request.nextUrl.searchParams.get("workspace") ?? "";
  try {
    const url = await startWorkspaceSwitch(
      { id: session.user.id, organizationId: session.user.organizationId },
      slug,
      request.nextUrl.searchParams.get("next")
    );
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(`${base}${homePathForRole(org, session.user.role)}`);
  }
}
