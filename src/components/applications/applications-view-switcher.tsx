"use client";

import { useEffect, useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { ApplicationsBoard } from "@/components/applications/applications-board";
import { PipelineApplicationsBoard, type BoardStage } from "@/components/applications/pipeline-applications-board";
import { getFavoriteApplicationIds } from "@/lib/favorite-applications";
import { APPLICATION_STATUSES, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { PIPELINE_LABELS } from "@/lib/pipeline-labels";
import { PipelineDiagramDialog, type DiagramStage } from "@/components/shared/pipeline-diagram";

type Stage = { id: string; abbrev: string; name: string; hex: string };

type AppRow = {
  id: string;
  name: string;
  status: string;
  pipeline: "HOME_CARE" | "CILA_GROUP_HOME" | "MCO" | null;
  stageId: string | null;
  stage: Stage | null;
  client: { name: string };
  assignedUser: { id: string; name: string };
  taskProgress: { total: number; done: number };
  readyToSubmit: boolean;
  staleDays: number | null;
};

const VIEW_KEY = "hclm:applications-view";
const FILTER_KEY = "hclm:applications-filter";
const TAB_KEY = "hclm:applications-pipeline-tab";
type Filter = "all" | "mine" | "favorites" | ApplicationStatus;
type PipelineTab = "HOME_CARE" | "CILA_GROUP_HOME" | "NO_PIPELINE";

const TABS: PipelineTab[] = ["HOME_CARE", "CILA_GROUP_HOME", "NO_PIPELINE"];

export function ApplicationsViewSwitcher({
  applications,
  assignableUsers,
  currentUserId,
  pipelineStages,
  pipelineStagesFull,
}: {
  applications: AppRow[];
  assignableUsers: { id: string; name: string }[];
  currentUserId: string;
  // Non-exit stage catalog per pipeline — Application.pipeline is never
  // "MCO" (that's exclusively the McoCredential model's pipeline), so only
  // these two are needed for a Kanban board.
  pipelineStages: { HOME_CARE: BoardStage[]; CILA_GROUP_HOME: BoardStage[] };
  // Same two pipelines, but including exit statuses — the Kanban board
  // deliberately excludes those (see pipeline-applications-board.tsx), but
  // the reference diagram shouldn't hide them.
  pipelineStagesFull: { HOME_CARE: DiagramStage[]; CILA_GROUP_HOME: DiagramStage[] };
}) {
  const [view, setView] = useState<"table" | "board">("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<PipelineTab>("HOME_CARE");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setTimeout(() => {
      const savedView = window.localStorage.getItem(VIEW_KEY);
      const savedFilter = window.localStorage.getItem(FILTER_KEY);
      const savedTab = window.localStorage.getItem(TAB_KEY);
      if (savedView === "table" || savedView === "board") setView(savedView);
      if (savedFilter) setFilter(savedFilter as Filter);
      if (savedTab === "HOME_CARE" || savedTab === "CILA_GROUP_HOME" || savedTab === "NO_PIPELINE") setTab(savedTab);
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

  function changeTab(next: PipelineTab) {
    setTab(next);
    window.localStorage.setItem(TAB_KEY, next);
    setFilter("all");
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

  const byTab = applications.filter((app) =>
    tab === "NO_PIPELINE" ? app.pipeline === null : app.pipeline === tab
  );

  const filtered = byTab.filter((app) => {
    if (filter === "all") return true;
    if (filter === "mine") return app.assignedUser.id === currentUserId;
    if (filter === "favorites") return favoriteIds.has(app.id);
    return app.status === filter;
  });

  // Legacy per-status chips only make sense on the No Pipeline tab — those
  // cases have no stage, old status is still their only progress field. The
  // pipeline tabs already show progress via stage columns/badges instead.
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "mine", label: "Mine" },
    { key: "favorites", label: "Favorites" },
    ...(tab === "NO_PIPELINE" ? APPLICATION_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })) : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-xs w-fit" data-tour="pipeline-tabs">
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? "default" : "ghost"} size="xs" onClick={() => changeTab(t)}>
            {t === "NO_PIPELINE" ? "No Pipeline" : PIPELINE_LABELS[t]}
            <span className="ml-1 opacity-70">
              {applications.filter((a) => (t === "NO_PIPELINE" ? a.pipeline === null : a.pipeline === t)).length}
            </span>
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs w-fit" data-tour="view-switcher">
          <Button variant={view === "table" ? "default" : "ghost"} size="xs" onClick={() => changeView("table")}>
            <List className="size-3.5" /> Table
          </Button>
          <Button variant={view === "board" ? "default" : "ghost"} size="xs" onClick={() => changeView("board")}>
            <LayoutGrid className="size-3.5" /> Board
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {tab !== "NO_PIPELINE" && (
            <PipelineDiagramDialog
              pipeline={tab}
              pipelineLabel={PIPELINE_LABELS[tab]}
              stages={pipelineStagesFull[tab]}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {byTab.length}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" data-tour="filter-chips">
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
      ) : tab === "NO_PIPELINE" ? (
        <ApplicationsBoard applications={filtered} />
      ) : (
        <PipelineApplicationsBoard
          applications={filtered.filter((a): a is typeof a & { stageId: string } => a.stageId !== null)}
          stages={pipelineStages[tab]}
        />
      )}
    </div>
  );
}
