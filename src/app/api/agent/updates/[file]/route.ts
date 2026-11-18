import { NextResponse } from "next/server";
import { isReleaseFile, releaseFileUrl } from "@/lib/agent-releases";

// Public on purpose (installers and update manifests aren't secret): the
// desktop app's auto-updater fetches latest.yml here before anyone signs in
// again, and the download page links here. Only electron-builder output
// names are accepted, and only under agent-releases/ in the bucket.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isReleaseFile(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = await releaseFileUrl(file);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
