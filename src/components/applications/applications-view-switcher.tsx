"use client";

import { useEffect, useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { ApplicationsBoard } from "@/components/applications/applications-board";
import { getFavoriteApplicationIds } from "@/lib/favorite-applications";
import { APPLICATION_STATUSES, STATUS_LABELS, ApplicationStatus } from "@/lib/status";

type AppRow = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  assignedUser: { id: string; name: string };
};

const VIEW_KEY = "hclm:applications-view";
const FILTER_KEY = "hclm:applications-filter";
type Filter = "all" | "mine" | "favorites" | ApplicationStatus;

export function ApplicationsViewSwitcher({
  applications,
  assignableUsers,
  currentUserId,
}: {
  applications: AppRow[];
  assignableUsers: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [view, setView] = useState<"table" | "board">("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setTimeout(() => {
      const savedView = window.localStorage.getItem(VIEW_KEY);
      const savedFilter = window.localStorage.getItem(FILTER_KEY);
      if (savedView === "table" || savedView === "board") setView(savedView);
      if (savedFilter) setFilter(savedFilter as Filter);
      setFavoriteIds(getFavoriteApplicationIds());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function changeView(next: "table" | "board") {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    window.localStorage.setItem(FILTER_KEY, next);
  }

  // FavoriteStar already performs the actual localStorage toggle and reports
  // the resulting state — this just keeps our own copy (used for the
  // "Favorites" filter chip) in sync. Toggling again here would flip it back.
  function handleFavoriteChange(id: string, isFavorite: boolean) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const filtered = applications.filter((app) => {
    if (filter === "all") return true;
    if (filter === "mine") return app.assignedUser.id === currentUserId;
    if (filter === "favorites") return favoriteIds.has(app.id);
    return app.status === filter;
  });

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "mine", label: "Mine" },
    { key: "favorites", label: "Favorites" },
    ...APPLICATION_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs w-fit">
          <Button variant={view === "table" ? "default" : "ghost"} size="xs" onClick={() => changeView("table")}>
            <List className="size-3.5" /> Table
          </Button>
          <Button variant={view === "board" ? "default" : "ghost"} size="xs" onClick={() => changeView("board")}>
            <LayoutGrid className="size-3.5" /> Board
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {applications.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => changeFilter(chip.key)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filter === chip.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {view === "table" ? (
        <ApplicationsTable
          applications={filtered}
          assignableUsers={assignableUsers}
          favoriteIds={favoriteIds}
          onFavoriteChange={handleFavoriteChange}
        />
      ) : (
        <ApplicationsBoard applications={filtered} />
      )}
    </div>
  );
}
