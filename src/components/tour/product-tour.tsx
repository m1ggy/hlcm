"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// The tour walks across a handful of pages rather than staying on one
// screen — each step carries the route it needs via `data.path`.
// onNextClick/onPrevClick below check whether the next/previous step lives
// on a different route and navigate there before repositioning driver.js,
// instead of just calling moveNext()/movePrevious() like a same-page tour
// would.
type TourStep = DriveStep & { data: { path: string } };

/** Which tasks-only workspace tour, if any (src/lib/work.ts workScope sides). */
export type TasksTourSide = "client" | "team";

const optional = { skipMissingElement: true, waitForElement: 0 } as const;

// Managing-company staff with client workspaces see the switcher at the top
// of the sidebar (src/components/workspaces/workspace-switcher.tsx).
function switcherStep(path: string): TourStep {
  return {
    data: { path },
    element: '[data-tour="workspace-switcher"]',
    popover: {
      title: "Switch workspace",
      description: "You work in more than one workspace: your own company's and each client company you're assigned to. Pick one here to open it — each keeps its own tasks, people and notifications, and you're signed in to it without a password.",
      side: "right",
    },
    ...optional,
  } satisfies TourStep;
}

// Every role that reaches this component gets its own step list, built to
// match exactly what that role's own sidebar/layout shows — a shared list
// with steps silently skipped for missing elements looked right for
// ADMIN/MANAGER/STAFF (who differ by a few extra sections each) but fell
// apart for CAREGIVER and CLIENT, whose UIs aren't a subset of the staff
// layout at all (different pages, different — or no — sidebar, no
// Applications/Projects/Time/Invoices/Admin to skip past).

function buildStaffSteps(role: string | undefined): TourStep[] {
  const isAdmin = role === "ADMIN" || role === "OWNER" || role === "ACCOUNTANT" || role === "DEVELOPER";
  const canSeeAllUsersTime = isAdmin || role === "MANAGER";
  const canManageInvoices = role === "ACCOUNTANT" || role === "OWNER" || role === "DEVELOPER";

  const steps: TourStep[] = [
    switcherStep("/"),
    {
      data: { path: "/" },
      element: '[data-tour="pipeline-alerts"]',
      popover: {
        title: "Pipeline Alerts",
        description: "The first thing you'll see after signing in — cases and MCO credentials that need attention right now: stuck in Supervisor Review too long, a corrections deadline coming up, an MCO recredentialing due date approaching, that kind of thing. Computed fresh every time you load this page.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-projects"]',
      popover: {
        title: "Projects",
        description: "Groups related clients together — handy when a batch of cases moves through licensing as one portfolio.",
        side: "right",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-clients"]',
      popover: {
        title: "Clients",
        description: "Every company or facility you do licensing work for.",
        side: "right",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-applications"]',
      popover: {
        title: "Applications",
        description: "This is where case work actually happens — one entry per license or renewal.",
        side: "right",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-tasks"]',
      popover: {
        title: "My Tasks",
        description: "Recurring or one-off work that isn't tied to any case — ops jobs, credential renewals, that kind of thing. Anything with subtasks expands right in the list.",
        side: "right",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-form-submissions"]',
      popover: {
        title: "Form Submissions",
        description: "The review queue for anyone who filled out one of your public intake forms. Create a new Client from a submission's answers, attach it to an existing one, or dismiss it as spam — nothing becomes a Client until you say so.",
        side: "right",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-time"]',
      popover: {
        title: "Time",
        description: "Your own clock-in history lives here. Admins and managers also get a company-wide report with filters and a PDF export.",
        side: "right",
      },
    },
    ...(canManageInvoices
      ? [
          {
            data: { path: "/applications" },
            element: '[data-tour="nav-invoices"]',
            popover: {
              title: "Invoices",
              description: "Bill a client and email them a PDF invoice with a \"Pay now\" link — Stripe confirms payment automatically, no need to mark it by hand unless they paid another way. Visible to admins and managers.",
              side: "right",
            },
            skipMissingElement: true,
            waitForElement: 0,
          } satisfies TourStep,
        ]
      : []),
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-payroll"]',
      popover: {
        title: "Payroll",
        description: "Each pay period's hours and pay per person. The accountant marks people paid and adds pay files; everyone paid confirms receipt from their own Time page. Visible to admins and managers.",
        side: "right",
      },
      skipMissingElement: true,
      waitForElement: 0,
    } satisfies TourStep,
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-client-workspaces"]',
      popover: {
        title: "Client workspaces",
        description: "Each client company you do task work for has its own workspace. Assign people to them here; account managers can assign staff to the ones they run.",
        side: "right",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/applications" },
      element: '[data-tour="nav-admin"]',
      popover: {
        title: "Admin",
        description: "User accounts and hourly rates, document templates, license types, case types, and checklist templates — visible to admins only.",
        side: "right",
      },
      skipMissingElement: true,
      // Without this, a non-admin hits the global 3s waitForElement before
      // driver.js even checks skipMissingElement — a dead pause on every
      // non-admin tour run for a step that will never have its element.
      waitForElement: 0,
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="time-clock"]',
      popover: {
        title: "Clock in / out",
        description: "This stays in the header on every page. Clock in when you start working, clock out when you're done — it feeds straight into the Time page.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="handbook-link"]',
      popover: {
        title: "Staff handbook",
        description: "A written walkthrough of everything in this tour, plus more detail — opens in a new tab, no login needed, so it's safe to share with someone before they have an account.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="search"]',
      popover: {
        title: "Quick search",
        description: "Jump straight to a case, client, or document by name. Ctrl+K (⌘K on a Mac) does the same thing from anywhere.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="notifications"]',
      popover: {
        title: "Notifications",
        description: "New task assignments, reassignments, review requests, status changes, and new shares land here.",
        side: "bottom",
        align: "end",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="pipeline-tabs"]',
      popover: {
        title: "Pipeline tabs",
        description: "Each pipeline runs through its own licensing stages, so each gets its own tab and its own board — cases on different pipelines aren't on the same track. A case's license type decides its pipeline (set per license type in Admin > License Types); a case with no license type lands on the last tab. A small number of older cases predate all this and still sit on the plain status field until someone gives them a stage. The vertical strip of colored dots on the right is a legend for every stage on this tab — hover any pill elsewhere in the app to match its color back to a name. \"Pipeline map\" opens the full stage flow with colors and which backward moves are allowed; it also opens itself automatically the first time you visit a tab, so you're not left guessing.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="view-switcher"]',
      popover: {
        title: "Table or board",
        description: "Switch between a sortable table and a drag-and-drop stage board — same cases, either way. Dragging a card checks the same move rules as the stage picker: a disallowed move snaps back with a message instead of silently landing.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="filter-chips"]',
      popover: {
        title: "Filters",
        description: "Narrow the list down to your own cases or favorites. On the MCO tab you can also filter by the old status field, for the few leftover cases that don't have a stage yet.",
        side: "bottom",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-tour="new-application"]',
      popover: {
        title: "Start a case",
        description: "Opens a new Application — pick the client, and a checklist is created for you based on license and case type.",
        side: "left",
      },
    },
    {
      data: { path: "/applications" },
      element: '[data-slot="table-container"]',
      popover: {
        title: "Open a case",
        description: "Click any case for its checklist, files, generated documents, comments, sharing, and audit log — plus a client info panel with contact details for whoever you're licensing for. If it's on a pipeline, you'll also see its current stage (type to search, or pick from the list), how many days it's been sitting there, and its position in the flow — \"Step 4 of 7\", for instance.",
        side: "top",
      },
    },
    {
      data: { path: "/clients" },
      element: '[data-slot="table-container"]',
      popover: {
        title: "Client details",
        description: "Click a client for business and owner contact info, MCO credentialing (one row per MCO they're enrolling with), a separate login-credentials section for portal logins, a running notes thread, every case tied to them, and a full audit log.",
        side: "top",
      },
    },
    {
      data: { path: "/time" },
      element: '[data-tour="my-time"]',
      popover: {
        title: "Your sessions",
        description: "Every clock-in/out you've made. The clock button in the header works from any page — this is just where the history shows up.",
        side: "top",
      },
    },
    ...(canSeeAllUsersTime
      ? [
          {
            data: { path: "/time" },
            element: '[data-tour="all-users-time"]',
            popover: {
              title: "Company-wide time report",
              description: "Pick a user (or everyone) and a date range to see total hours × rate and download it as a PDF. Admins get individual sessions listed below the totals too, with an \"Add time\" button for a missed punch and a delete on each row for a mistaken one.",
              side: "top",
            },
          } satisfies TourStep,
        ]
      : []),
    ...(canManageInvoices
      ? [
          {
            data: { path: "/invoices" },
            element: '[data-tour="new-invoice"]',
            popover: {
              title: "Create an invoice",
              description: "Pick Online for a Stripe-hosted \"Pay now\" link, Manual for billing without one, or Care Recipient to bill a specific recipient by their logged visits or a day-rate range.",
              side: "bottom",
            },
          } satisfies TourStep,
          {
            data: { path: "/invoices" },
            element: '[data-slot="table-container"]',
            popover: {
              title: "Invoice list",
              description: "Filter by status with the chips above. Click any invoice for its line items, a Send/Resend button, the hosted invoice page and PDF once sent, a Mark Paid override for payments taken outside Stripe, and a full audit log.",
              side: "top",
            },
            // Empty for a brand-new company — no invoices means no table yet.
            skipMissingElement: true,
            waitForElement: 0,
          } satisfies TourStep,
        ]
      : []),
    ...(isAdmin
      ? [
          {
            data: { path: "/admin/document-templates" },
            element: '[data-tour="new-document-template"]',
            popover: {
              title: "Document templates",
              description: "Upload a .docx with {merge_tags} in it — map each tag to auto-filled data (client name, case type, today's date, ...) or leave it for staff to fill in when generating. Existing templates show their field mapping, the original file, and how many times they've been used.",
              side: "bottom",
            },
          } satisfies TourStep,
        ]
      : []),
  ];

  return steps;
}

// A Caregiver's whole UI is Today + My Recipients + My Hours + My Tasks
// (+ Clients when they have any) + Account (see CAREGIVER_LINKS in
// app-sidebar-nav.tsx) — everything else in the staff tour above doesn't
// exist for this role at all, so it gets its own short list rather than
// reusing the staff one with steps skipped.
function buildCaregiverSteps(): TourStep[] {
  return [
    {
      data: { path: "/today" },
      element: '[data-tour="today"]',
      popover: {
        title: "Today",
        description: "Your home screen. Today's scheduled visits, each with a Start visit button. During a visit this becomes your checklist: tick off each care task, take a break, report a concern, and End visit with a short note when you leave.",
        side: "bottom",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="nav-recipients"]',
      popover: {
        title: "My Recipients",
        description: "Everyone you care for — address, contacts, care needs, your visit times, and the last few visit notes from whoever went before you.",
        side: "right",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="nav-hours"]',
      popover: {
        title: "My Hours",
        description: "Every visit and shift you've clocked, by week. If something looks wrong, tell the office — they can fix it.",
        side: "right",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="nav-tasks"]',
      popover: {
        title: "My Tasks",
        description: "Anything else the office assigns you — paperwork, trainings, one-off to-dos.",
        side: "right",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="time-clock"]',
      popover: {
        title: "Start / end a visit from anywhere",
        description: "The same visit controls also sit in the header on every page. Starting a visit captures your location so the office can confirm you're on site — allow location when your browser asks.",
        side: "bottom",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="notifications"]',
      popover: {
        title: "Notifications",
        description: "New people assigned to you and new tasks land here (and in your email, unless you turn that off in Settings).",
        side: "bottom",
        align: "end",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="handbook-link"]',
      popover: {
        title: "Handbook",
        description: "A written walkthrough, including a section written specifically for caregivers — opens in a new tab, no login needed.",
        side: "bottom",
      },
    },
    {
      data: { path: "/today" },
      element: '[data-tour="nav-settings"]',
      popover: {
        title: "Settings",
        description: "Password, MFA, notification preferences, and your timezone — set it so your visit times line up.",
        side: "right",
      },
    },
  ];
}

// The client portal (src/app/(portal)/) is a separate, single-page layout
// with no sidebar at all — nothing in the staff or Caregiver lists above
// applies, so this is built from scratch around the one page a CLIENT
// session ever lands on.
function buildClientSteps(): TourStep[] {
  return [
    {
      data: { path: "/portal" },
      element: '[data-tour="portal-applications"]',
      popover: {
        title: "Your Applications",
        description: "Every case that's been shared with you, each showing its current stage or status. Click a card to open its Checklist, Files, and Documents tabs — the same checklist phases staff work from, any documents once they're sent to you, and files you can download (or upload to, if you've been given edit access).",
        side: "bottom",
      },
    },
    {
      data: { path: "/portal" },
      element: '[data-tour="email-notifications"]',
      popover: {
        title: "Email notifications",
        description: "On by default — you'll get an email whenever a shared case's status changes. Turn it off here if you'd rather just check the bell.",
        side: "bottom",
      },
    },
    {
      data: { path: "/portal" },
      element: '[data-tour="notifications"]',
      popover: {
        title: "Notifications",
        description: "Status changes and new shares land here. Click one to jump straight to that case.",
        side: "bottom",
        align: "end",
      },
    },
  ];
}

// A client company's tasks-only workspace (docs/workspace-tasks-plan.md):
// This week / Projects / Settings (+ Users for its admins). The client's
// own people see what the team shares with them and ask for work.
function buildTasksClientSteps(): TourStep[] {
  return [
    {
      data: { path: "/work/summary" },
      element: '[data-tour="summary-header"]',
      popover: {
        title: "Your weekly summary",
        description: "Your home page: what your team did for you this week, day by day. Use the arrows or pick a date to look back at any week, and Print for a clean copy.",
        side: "bottom",
      },
    },
    {
      data: { path: "/work/summary" },
      element: '[data-tour="summary-days"]',
      popover: {
        title: "Day by day",
        description: "Each card shows what was finished, moved forward or added that day, plus comments and files shared with you. Click a day for the details, and a task to open it.",
        side: "top",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="work-projects"]',
      popover: {
        title: "Projects",
        description: "Everything the team is working on for you, with progress. Open a project for its tasks; open a task to comment or add files.",
        side: "top",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="request-task"]',
      popover: {
        title: "Request a task",
        description: "Need something done? Ask here. The team picks it up (or tells you why not), and you follow it like any other task.",
        side: "bottom",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/work" },
      element: '[data-tour="notifications"]',
      popover: {
        title: "Notifications",
        description: "Replies to your comments, finished requests and new tasks for you land here — and in your email, unless you turn that off in Settings.",
        side: "bottom",
        align: "end",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="nav-admin"]',
      popover: {
        title: "Users",
        description: "Invite the people at your company who should follow this work. The staff working for you are added by your managing company.",
        side: "right",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/work" },
      element: '[data-tour="nav-settings"]',
      popover: {
        title: "Settings",
        description: "Password, two-factor sign-in, email notifications and your timezone.",
        side: "right",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="handbook-link"]',
      popover: {
        title: "Handbook",
        description: "A written guide with a section for client workspaces — opens in a new tab.",
        side: "bottom",
      },
    },
  ];
}

// The managing company's people inside a client's workspace.
function buildTasksTeamSteps(): TourStep[] {
  return [
    switcherStep("/work/summary"),
    {
      data: { path: "/work/summary" },
      element: '[data-tour="summary-header"]',
      popover: {
        title: "The client's weekly summary",
        description: "This is the client's home page, and you see it as they do: what was finished, moved forward or added each day. Hidden tasks and internal comments never show here.",
        side: "bottom",
      },
    },
    {
      data: { path: "/work/summary" },
      element: '[data-tour="summary-settings"]',
      popover: {
        title: "Summary settings",
        description: "Managers choose whether the client sees hours, whether Claude drafts the daily and weekly notes, and whether the client gets the Monday email. You can edit or rewrite any note on the page.",
        side: "left",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/work" },
      element: '[data-tour="new-project"]',
      popover: {
        title: "New project",
        description: "Projects hold the tasks. Leave a project or task visible to the client, or hide it for internal work.",
        side: "left",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/work" },
      element: '[data-tour="work-projects"]',
      popover: {
        title: "Projects",
        description: "Open a project for its board and list. Drag tasks between statuses, assign people, set due dates; comments can be shared with the client or kept internal.",
        side: "top",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="nav-work-my"]',
      popover: {
        title: "My tasks",
        description: "Everything assigned to you in this workspace, overdue first.",
        side: "right",
      },
    },
    {
      data: { path: "/work" },
      element: '[data-tour="task-timer"]',
      popover: {
        title: "Task timer",
        description: "Time your work on a task here. Your team sees the hours; the client sees them only if a manager turns that on.",
        side: "bottom",
      },
      ...optional,
    } satisfies TourStep,
    {
      data: { path: "/work" },
      element: '[data-tour="notifications"]',
      popover: {
        title: "Notifications",
        description: "Assignments, client comments and client task requests land here.",
        side: "bottom",
        align: "end",
      },
    },
  ];
}

function buildSteps(role: string | undefined, tasksSide?: TasksTourSide): TourStep[] {
  if (tasksSide === "client") return buildTasksClientSteps();
  if (tasksSide === "team") return buildTasksTeamSteps();
  if (role === "CAREGIVER") return buildCaregiverSteps();
  if (role === "CLIENT") return buildClientSteps();
  return buildStaffSteps(role);
}

function firstPathFor(role: string | undefined, tasksSide?: TasksTourSide): string {
  if (tasksSide) return "/work/summary";
  if (role === "CAREGIVER") return "/today";
  if (role === "CLIENT") return "/portal";
  return "/applications";
}

export function ProductTour({ role, tasksSide }: { role?: string; tasksSide?: TasksTourSide }) {
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);
  const steps = useMemo(() => buildSteps(role, tasksSide), [role, tasksSide]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  function goToIndex(targetIndex: number) {
    const step = steps[targetIndex];
    if (!step) {
      driverRef.current?.destroy();
      return;
    }
    if (step.data.path !== pathnameRef.current) {
      pendingIndexRef.current = targetIndex;
      router.push(step.data.path);
    } else {
      driverRef.current?.drive(targetIndex);
    }
  }

  function start(fromIndex = 0) {
    driverRef.current?.destroy();
    driverRef.current = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: "#0f1220",
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: "hclm-tour-popover",
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      waitForElement: 3000,
      steps,
      onNextClick: (_el, _step, opts) => goToIndex((opts.index ?? 0) + 1),
      onPrevClick: (_el, _step, opts) => goToIndex((opts.index ?? 0) - 1),
    });
    driverRef.current.drive(fromIndex);
  }

  // Resumes the (already-running) tour once navigation lands on the route
  // the pending step needs — driver.js's own waitForElement handles the
  // remaining race against that page's data still loading in.
  useEffect(() => {
    const idx = pendingIndexRef.current;
    if (idx === null) return;
    const step = steps[idx];
    if (!step || step.data.path !== pathname) return;
    pendingIndexRef.current = null;
    if (driverRef.current) {
      driverRef.current.drive(idx);
    } else {
      start(idx);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick() {
    const firstPath = steps[0]?.data.path ?? firstPathFor(role, tasksSide);
    if (pathname === firstPath) {
      start(0);
    } else {
      pendingIndexRef.current = 0;
      router.push(firstPath);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} title="Take a guided tour">
      <Compass className="size-3.5" /> Take a tour
    </Button>
  );
}
