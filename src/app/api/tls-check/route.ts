import { isAllowedTlsHost } from "@/lib/tenant";

// Asked by Caddy (on_demand_tls { ask … } in the Caddyfile) before it
// requests a certificate for a hostname it hasn't seen: 200 = go ahead,
// anything else = refuse. See isAllowedTlsHost for the rule.
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain");
  const allowed = await isAllowedTlsHost(domain);
  return new Response(null, { status: allowed ? 200 : 404 });
}
