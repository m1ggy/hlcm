"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

const CHECK_EVERY_MS = 5 * 60_000;
const TOAST_ID = "new-version";

// Typed into a field and not submitted yet (reset on submit and on navigation).
let unsaved = false;

/**
 * Picks up a new deploy in a tab that was opened before it. Next's
 * deploymentId already turns the next in-app navigation into a full page
 * load; this covers tabs that just sit open. When the server's build differs
 * from the one this tab loaded:
 * - tab in the background and nothing typed: reload quietly;
 * - otherwise: a "New version available" toast with Refresh, and a quiet
 *   reload the next time the tab is put in the background with nothing typed.
 * Does nothing where no deployment ID is set (local dev).
 */
export function VersionWatcher() {
  const pathname = usePathname();

  // A new page means nothing typed on it yet.
  useEffect(() => {
    unsaved = false;
  }, [pathname]);

  useEffect(() => {
    const loaded = document.documentElement.dataset.dplId;
    if (!loaded) return;

    let outdated = false;
    let checking = false;

    // Only typing counts: checkboxes, toggles and filters save (or don't matter) on their own.
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const typed =
        el instanceof HTMLTextAreaElement ||
        el.isContentEditable ||
        (el instanceof HTMLInputElement && !["checkbox", "radio", "range", "file", "button", "submit", "color"].includes(el.type));
      if (typed) unsaved = true;
    };
    const onSubmit = () => {
      unsaved = false;
    };

    const reloadIfSafe = () => {
      if (outdated && document.visibilityState === "hidden" && !unsaved) window.location.reload();
    };

    const check = async () => {
      if (outdated || checking) return;
      checking = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id: string | null };
        if (!id || id === loaded) return;
        outdated = true;
        if (document.visibilityState === "hidden" && !unsaved) {
          window.location.reload();
          return;
        }
        toast("A new version of the app is available", {
          id: TOAST_ID,
          description: unsaved ? "Save what you're working on first." : "Refresh to get the latest changes.",
          duration: Infinity,
          action: { label: "Refresh", onClick: () => window.location.reload() },
        });
      } catch {
        // Offline or mid-deploy: try again next time.
      } finally {
        checking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
      else reloadIfSafe();
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
