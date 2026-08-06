"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS: DriveStep[] = [
  {
    element: '[data-tour="nav-projects"]',
    popover: {
      title: "Projects",
      description: "Groups related clients together — handy when a batch of cases moves through licensing as one portfolio.",
      side: "right",
    },
  },
  {
    element: '[data-tour="nav-clients"]',
    popover: {
      title: "Clients",
      description: "Every company or facility you do licensing work for.",
      side: "right",
    },
  },
  {
    element: '[data-tour="nav-applications"]',
    popover: {
      title: "Applications",
      description: "This is where case work actually happens — one entry per license or renewal.",
      side: "right",
    },
  },
  {
    element: '[data-tour="nav-tasks"]',
    popover: {
      title: "My Tasks",
      description: "Recurring or one-off work that isn't tied to any case — ops jobs, credential renewals, that kind of thing.",
      side: "right",
    },
  },
  {
    element: '[data-tour="nav-admin"]',
    popover: {
      title: "Admin",
      description: "User accounts, document templates, and case-type setup — visible to admins only.",
      side: "right",
    },
    skipMissingElement: true,
  },
  {
    element: '[data-tour="search"]',
    popover: {
      title: "Quick search",
      description: "Jump straight to a case, client, or document by name. Ctrl+K (⌘K on a Mac) does the same thing from anywhere.",
      side: "bottom",
    },
  },
  {
    element: '[data-tour="notifications"]',
    popover: {
      title: "Notifications",
      description: "Reassignments, review requests, status changes, and new shares land here.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="view-switcher"]',
    popover: {
      title: "Table or board",
      description: "Switch between a sortable table and a drag-and-drop status board — same cases, either way.",
      side: "bottom",
    },
  },
  {
    element: '[data-tour="filter-chips"]',
    popover: {
      title: "Filters",
      description: "Narrow the list down to your own cases, favorites, or a specific status.",
      side: "bottom",
    },
  },
  {
    element: '[data-tour="new-application"]',
    popover: {
      title: "Start a case",
      description: "Opens a new Application — pick the client, and a checklist is created for you based on license and case type.",
      side: "left",
    },
  },
  {
    element: '[data-slot="table-container"]',
    popover: {
      title: "Open a case",
      description: "Click any case to see its checklist, files, comments, and audit log. That's the rest of the tour — explore from there.",
      side: "top",
    },
  },
];

const TOUR_ROUTE = "/applications";

export function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const pendingRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  function start() {
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
      steps: STEPS,
    });
    driverRef.current.drive();
  }

  useEffect(() => {
    if (!pendingRef.current || pathname !== TOUR_ROUTE) return;
    pendingRef.current = false;
    const id = requestAnimationFrame(() => start());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  function handleClick() {
    if (pathname === TOUR_ROUTE) {
      start();
    } else {
      pendingRef.current = true;
      router.push(TOUR_ROUTE);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} title="Take a guided tour of HCLM">
      <Compass className="size-3.5" /> Take a tour
    </Button>
  );
}
