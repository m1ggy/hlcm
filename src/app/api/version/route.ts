import { connection } from "next/server";

// Which build this server is running (the deployed commit, see Dockerfile).
// Open tabs compare it with the build they loaded and pick up a new deploy
// (src/components/shared/version-watcher.tsx). Public: no session needed.
export async function GET() {
  await connection();
  return Response.json({ id: process.env.NEXT_DEPLOYMENT_ID || null }, { headers: { "Cache-Control": "no-store" } });
}
