const KEY = "hclm:favorite-applications";

export function getFavoriteApplicationIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function toggleFavoriteApplication(id: string): Set<string> {
  const current = getFavoriteApplicationIds();
  if (current.has(id)) current.delete(id);
  else current.add(id);
  window.localStorage.setItem(KEY, JSON.stringify([...current]));
  return current;
}
