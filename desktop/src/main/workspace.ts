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
