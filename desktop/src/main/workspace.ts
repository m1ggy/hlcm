// Which workspace the app signs in to. Every workspace has its own address,
// <slug>.<rootDomain> (docs/activity-monitoring-plan.md), and the app's
// tokens only work there, so sign-in asks for the workspace: its short name
// ("ctk"), its address ("ctk.carenela.com"), or a full URL (a test server).
// Pure, unit-tested in workspace.test.ts.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isLocal(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

/** The workspace's origin (https://ctk.carenela.com), or null if it can't be one. */
export function workspaceUrl(raw: string, rootDomain: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\/+$/, "");
  if (!value) return null;
  if (!value.includes(".") && !value.includes(":")) {
    if (!rootDomain || !SLUG.test(value)) return null;
    return `https://${value}.${rootDomain}`;
  }
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && !(isLocal(url.hostname) && url.protocol === "http:")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** What to show in the Workspace field for a saved address: the short name when it's on the root domain. */
export function workspaceLabel(serverUrl: string, rootDomain: string): string {
  try {
    const { hostname, origin } = new URL(serverUrl);
    if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
      const slug = hostname.slice(0, -rootDomain.length - 1);
      if (SLUG.test(slug)) return slug;
    }
    return origin;
  } catch {
    return "";
  }
}

export const CONNECT_SCHEME = "carenela";

/**
 * A "Connect the app" link from the web page:
 * carenela://connect?server=https://ctk.carenela.com&code=…
 * Only a workspace on the product's own domain is accepted (or a local test
 * server when `allowLocal`), so a link from anywhere else can't point the
 * app at a server that isn't Carenela's.
 */
export function parseConnectLink(raw: string, rootDomain: string, allowLocal: boolean): { serverUrl: string; code: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${CONNECT_SCHEME}:`) return null;
  // carenela://connect?… parses "connect" as the host; carenela:connect?… as the path.
  if ((url.hostname || url.pathname.replace(/^\/+|\/+$/g, "")) !== "connect") return null;
  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 2000) return null;
  let server: URL;
  try {
    server = new URL(url.searchParams.get("server") ?? "");
  } catch {
    return null;
  }
  const onRoot = !!rootDomain && server.protocol === "https:" && server.hostname.endsWith(`.${rootDomain}`) && SLUG.test(server.hostname.slice(0, -rootDomain.length - 1));
  const local = allowLocal && isLocal(server.hostname) && (server.protocol === "http:" || server.protocol === "https:");
  if (!onRoot && !local) return null;
  return { serverUrl: server.origin, code };
}

/** The connect link among a second instance's (or the first launch's) command-line arguments, on Windows. */
export function connectLinkInArgs(argv: string[]): string | null {
  return argv.find((arg) => arg.toLowerCase().startsWith(`${CONNECT_SCHEME}:`)) ?? null;
}
