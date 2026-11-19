import { requireWorkViewer } from "@/lib/work-session";
import { listAssignableUsers, workspaceToday } from "@/lib/work-data";
import { getWeekSummary, summaryHasHistory, weekStartOf } from "@/lib/work-summary";
import { aiSummariesConfigured } from "@/lib/work-ai";
import { isPlatformSmsConfigured } from "@/lib/sms";
import { countDailyTextRecipients } from "@/lib/work-summary-notes";
import { DEFAULT_TIMEZONE } from "@/lib/time-entries";
import { SummaryView } from "@/components/work/summary-view";
import { getCareWeek } from "@/lib/care-summary";
import { hasCare } from "@/lib/workspace-kind";

// The client's weekly summary (docs/workspace-tasks-plan.md, Phase 3): what
// was done each day, Monday to Sunday, any week back. The home page of a
// client's tasks-only workspace.
export default async function WorkSummaryPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string; person?: string }> }) {
  const { week, day, person } = await searchParams;
  const { viewer, scope, org } = await requireWorkViewer();
  const today = await workspaceToday();
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);
  const monday = weekStartOf(valid(week) ?? valid(day) ?? today);
  // Hours: shown to the client only when the workspace turns that on; the
  // team always sees them, marked as hidden from the client when they are.
  const withHours = org.workShowHoursToClient || scope.side === "team";
  const [summary, people, hasHistory, textPeople, care] = await Promise.all([
    getWeekSummary({ monday, timeZone: org.timezone || DEFAULT_TIMEZONE, orgKind: org.kind, withHours, hoursByPerson: scope.side === "team" }),
    scope.side === "team" ? listAssignableUsers(org.kind) : Promise.resolve([]),
    summaryHasHistory(org.kind),
    scope.canManageProjects ? countDailyTextRecipients() : Promise.resolve(0),
    // A care agency's workspace: its visits and concerns (docs/client-care-plan.md).
    org.kind === "TASKS" && hasCare(org) ? getCareWeek({ monday, timeZone: org.timezone || DEFAULT_TIMEZONE }) : Promise.resolve(null),
  ]);
  const focusedDay = valid(day);

  return (
    <SummaryView
      summary={summary}
      today={today}
      initialDay={focusedDay && focusedDay >= summary.from && focusedDay <= summary.to ? focusedDay : null}
      // Filtering to one person is the team's (docs/summary-by-person-plan.md).
      initialPerson={scope.side === "team" && summary.people.some((p) => p.id === person && p.side === "team") ? person! : null}
      scope={scope}
      currentUserId={viewer.userId}
      people={people}
      workspaceName={org.name}
      isNew={!hasHistory}
      care={care}
      settings={{
        showHoursToClient: org.workShowHoursToClient,
        aiSummaries: org.workAiSummaries,
        weeklyEmail: org.workWeeklyEmail,
        aiConfigured: aiSummariesConfigured(),
        dailyText: org.workDailyText,
        smsConfigured: isPlatformSmsConfigured(),
        textPeople,
      }}
    />
  );
}
