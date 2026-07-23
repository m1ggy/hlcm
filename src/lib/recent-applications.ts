const KEY = "hclm:recent-applications";
const MAX = 5;

type RecentEntry = { id: string; name: string; visitedAt: number };

export function getRecentApplications(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

export function addRecentApplication(id: string, name: string) {
  if (typeof window === "undefined") return;
  const existing = getRecentApplications().filter((e) => e.id !== id);
  const next = [{ id, name, visitedAt: Date.now() }, ...existing].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
