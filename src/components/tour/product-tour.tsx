"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// The tour walks across a handful of pages (Applications → Clients → Time →
// Account → Admin) rather than staying on one screen — each step carries the
// route it needs via `data.path`. onNextClick/onPrevClick below check
// whether the next/previous step lives on a different route and navigate
// there before repositioning driver.js, instead of just calling
// moveNext()/movePrevious() like a same-page tour would.
type TourStep = DriveStep & { data: { path: string } };

function buildSteps(role: string | undefined): TourStep[] {
  const isAdmin = role === "ADMIN";
  const canSeeAllUsersTime = isAdmin || role === "MANAGER";

  const steps: TourStep[] = [
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
      element: '[data-tour="nav-time"]',
      popover: {
        title: "Time",
        description: "Your own clock-in history lives here. Admins and managers also get a company-wide report with filters and a PDF export.",
        side: "right",
      },
    },
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
        description: "Home Care and CILA / Group Home each run through their own licensing stages, so each gets its own tab and its own board — a case in Step I Supervisor Review and one in HC Corrections Received aren't on the same track. \"No Pipeline\" holds older cases that predate this and any case type without a mapped pipeline yet; those still use the plain status field. The strip of colored dots below the view switcher is a legend for every stage on this tab — hover any pill elsewhere in the app to match its color back to a name. \"Pipeline map\" opens the full stage flow with colors and which backward moves are allowed; it also opens itself automatically the first time you visit a tab, so you're not left guessing.",
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
        description: "Narrow the list down to your own cases or favorites. On the No Pipeline tab you can also filter by the old status field.",
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
              description: "Pick a user (or everyone) and a date range to see total hours × rate, download it as a PDF, or send it straight out as a Wise payout.",
              side: "top",
            },
          } satisfies TourStep,
        ]
      : []),
    ...(isAdmin
      ? [
          {
            data: { path: "/time" },
            element: '[data-tour="recent-payouts"]',
            popover: {
              title: "Payout history",
              description: "Every payout attempt is logged here, including failures — so re-paying someone for a period is always a deliberate click, never an accident.",
              side: "top",
            },
          } satisfies TourStep,
        ]
      : []),
    {
      data: { path: "/account" },
      element: '[data-tour="payout-details"]',
      popover: {
        title: "Payout details",
        description: "Everyone adds their own bank details here for Wise payouts. The fields change based on country — a US routing number, an Indian IFSC code, a Pakistani IBAN — pulled live from Wise, not hardcoded.",
        side: "top",
      },
    },
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

export function ProductTour({ role }: { role?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);
  const steps = useMemo(() => buildSteps(role), [role]);

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
    const firstPath = steps[0]?.data.path ?? "/applications";
    if (pathname === firstPath) {
      start(0);
    } else {
      pendingIndexRef.current = 0;
      router.push(firstPath);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} title="Take a guided tour of HCLM">
      <Compass className="size-3.5" /> Take a tour
    </Button>
  );
}
