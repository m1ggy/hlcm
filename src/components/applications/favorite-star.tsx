"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFavoriteApplicationIds, toggleFavoriteApplication } from "@/lib/favorite-applications";

// Self-manages localStorage by default (standalone use, e.g. the detail page
// header). Pass `isFavorite`/`onToggle` when a parent needs to know about
// changes too (e.g. the Applications table's "Favorites" filter chip) —
// otherwise the parent's own copy of the favorites set goes stale the moment
// a star gets toggled, since localStorage isn't reactive across components.
export function FavoriteStar({
  applicationId,
  className,
  isFavorite: controlledIsFavorite,
  onToggle,
}: {
  applicationId: string;
  className?: string;
  isFavorite?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const [localIsFavorite, setLocalIsFavorite] = useState(false);
  const isControlled = controlledIsFavorite !== undefined;
  const isFavorite = isControlled ? controlledIsFavorite : localIsFavorite;

  useEffect(() => {
    if (isControlled) return;
    const id = setTimeout(() => setLocalIsFavorite(getFavoriteApplicationIds().has(applicationId)), 0);
    return () => clearTimeout(id);
  }, [applicationId, isControlled]);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleFavoriteApplication(applicationId);
    const nowFavorite = next.has(applicationId);
    if (!isControlled) setLocalIsFavorite(nowFavorite);
    onToggle?.(nowFavorite);
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} className={className} title={isFavorite ? "Remove from favorites" : "Add to favorites"}>
      <Star className={isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"} />
    </Button>
  );
}
