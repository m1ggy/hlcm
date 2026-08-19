"use client";

import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLLAPSE_KEY = "hclm:case-sidebar-collapsed";

/**
 * Case detail page's two-column layout — checklist on the left, client info +
 * tabs on the right. The right column can be collapsed to give the checklist
 * (and the task table inside it) the full row. Starts expanded every time —
 * a saved "1" in localStorage is the only thing that collapses it, so a
 * fresh visit (or a fresh browser) never opens collapsed.
 */
export function CaseDetailLayout({
  checklist,
  sidebar,
}: {
  checklist: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
      <div className={collapsed ? "min-w-0 lg:col-span-5" : "min-w-0 lg:col-span-3"}>
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" size="icon-sm" onClick={toggle} title={collapsed ? "Show case details" : "Hide case details"}>
            {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
          </Button>
        </div>
        {checklist}
      </div>
      {!collapsed && <div className="min-w-0 space-y-6 lg:col-span-2">{sidebar}</div>}
    </div>
  );
}
