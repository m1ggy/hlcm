import { readFile } from "fs/promises";
import path from "path";
import { PRODUCT_NAME } from "@/lib/branding";

// Static, self-contained staff handbook — screenshots and all, ~1.5MB.
// Served from `public/` under a clean path (rather than the default
// /handbook.html) and explicitly public in auth.config.ts: it's onboarding
// material, so it has to be reachable before someone has an account to sign
// in with. It's the same product guide for every workspace; the product name
// is filled in here (the file says "HCLM"), skipping the base64 screenshots
// so image data can never be rewritten.
export async function GET() {
  const html = await readFile(path.join(process.cwd(), "public", "handbook.html"), "utf8");
  const branded = html.replace(/data:[^"]*|\bHCLM\b/g, (m) => (m.startsWith("data:") ? m : PRODUCT_NAME));
  return new Response(branded, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
