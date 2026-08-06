import { readFile } from "fs/promises";
import path from "path";

// Static, self-contained staff handbook — screenshots and all, ~1.5MB.
// Served from `public/` under a clean path (rather than the default
// /handbook.html) and explicitly public in auth.config.ts: it's onboarding
// material, so it has to be reachable before someone has an account to sign
// in with.
export async function GET() {
  const html = await readFile(path.join(process.cwd(), "public", "handbook.html"), "utf8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
