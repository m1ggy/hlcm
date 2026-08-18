"use client";

import { useEffect, useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { PipelineApplicationsBoard, type BoardStage } from "@/components/applications/pipeline-applications-board";
import { getFavoriteApplicationIds } from "@/lib/favorite-applications";
import { APPLICATION_STATUSES, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { PIPELINE_LABELS } from "@/lib/pipeline-labels";
import { PipelineDiagramDialog, type DiagramStage } from "@/components/shared/pipeline-diagram";
import { StageLegendStrip } from "@/components/applications/stage-legend-strip";

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
type PipelineTab = "HOME_CARE" | "CILA_GROUP_HOME" | "MCO";

const TABS: PipelineTab[] = ["HOME_CARE", "CILA_GROUP_HOME", "MCO"];

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
  // Non-exit stage catalog per pipeline — a Kanban board's columns.
  pipelineStages: { HOME_CARE: BoardStage[]; CILA_GROUP_HOME: BoardStage[]; MCO: BoardStage[] };
  // Same three pipelines, but including exit statuses — the Kanban board
  // deliberately excludes those (see pipeline-applications-board.tsx), but
  // the reference diagram and legend shouldn't hide them.
  pipelineStagesFull: { HOME_CARE: DiagramStage[]; CILA_GROUP_HOME: DiagramStage[]; MCO: DiagramStage[] };
}) {
  const [view, setView] = useState<"table" | "board">("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<PipelineTab>("HOME_CARE");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Every mount starts on the "HOME_CARE" default for a tick before the
  // saved tab (below) loads — without this gate, the Pipeline Map's
  // auto-open key would flash from "HOME_CARE" to the real saved tab on
  // every single page visit, and could pop the dialog for whichever of the
  // three happened not to be marked "seen" yet. Auto-open waits for this to
  // flip true so it only ever evaluates the real, settled tab.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      const savedView = window.localStorage.getItem(VIEW_KEY);
      const savedFilter = window.localStorage.getItem(FILTER_KEY);
      const savedTab = window.localStorage.getItem(TAB_KEY);
      if (savedView === "table" || savedView === "board") setView(savedView);
      if (savedFilter) setFilter(savedFilter as Filter);
      if (savedTab === "HOME_CARE" || savedTab === "CILA_GROUP_HOME" || savedTab === "MCO") setTab(savedTab);
      setFavoriteIds(getFavoriteApplicationIds());
      setHydrated(true);
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

  // The MCO tab also catches cases with no pipeline at all — leftovers from
  // before every license type resolved to a real pipeline (createApplication
  // now defaults unmapped license types to MCO, but older rows can still
  // predate that and sit at pipeline: null). They show up here with the old
  // status field instead of a stage until someone moves them onto a stage.
  const byTab = applications.filter((app) =>
    tab === "MCO" ? app.pipeline === "MCO" || app.pipeline === null : app.pipeline === tab
  );

  const filtered = byTab.filter((app) => {
    if (filter === "all") return true;
    if (filter === "mine") return app.assignedUser.id === currentUserId;
    if (filter === "favorites") return favoriteIds.has(app.id);
    return app.status === filter;
  });

  // "Step N of M" position within the current tab's forward-flow stage
  // order — pipelineStages is already the non-exit catalog sorted by
  // sortOrder, so a case sitting in an exit status (On Hold/Withdrawn/
  // Hearing Lost) or with no stage at all simply won't be found and gets no
  // badge.
  const stagesForTab = pipelineStages[tab];
  const withStepInfo = filtered.map((app) => {
    const index = stagesForTab.findIndex((s) => s.id === app.stageId);
    return { ...app, stepInfo: index === -1 ? null : { index: index + 1, total: stagesForTab.length } };
  });

  // Legacy per-status chips only make sense on the MCO tab, where a stageless
  // leftover case (see byTab above) still relies on the old status field as
  // its only progress indicator. Every other tab shows progress via stage
  // columns/badges instead.
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "mine", label: "Mine" },
    { key: "favorites", label: "Favorites" },
    ...(tab === "MCO" ? APPLICATION_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })) : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-xs w-fit" data-tour="pipeline-tabs">
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? "default" : "ghost"} size="xs" onClick={() => changeTab(t)}>
            {PIPELINE_LABELS[t]}
            <span className="ml-1 opacity-70">
              {applications.filter((a) => (t === "MCO" ? a.pipeline === "MCO" || a.pipeline === null : a.pipeline === t)).length}
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
          <PipelineDiagramDialog
            pipeline={tab}
            pipelineLabel={PIPELINE_LABELS[tab]}
            stages={pipelineStagesFull[tab]}
            autoOpenKey={hydrated ? tab : undefined}
          />
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {byTab.length}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-3">
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
              applications={withStepInfo}
              assignableUsers={assignableUsers}
              favoriteIds={favoriteIds}
              onFavoriteChange={handleFavoriteChange}
              pipelineMode
            />
          ) : (
            <PipelineApplicationsBoard
              applications={filtered.filter((a): a is typeof a & { stageId: string } => a.stageId !== null)}
              stages={pipelineStages[tab]}
            />
          )}
        </div>

        <StageLegendStrip stages={pipelineStagesFull[tab]} />
      </div>
    </div>
  );
}
