"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const GO_TO: Record<string, string> = {
  h: "/",
  p: "/projects",
  c: "/clients",
  a: "/applications",
  t: "/tasks",
};

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

// "g" then a letter navigates (g a -> Applications, g t -> Tasks, etc.),
// matching the go-to convention from Linear/GitHub. Waits briefly for the
// second key before resetting, so a bare "g" typed elsewhere doesn't linger.
export function GlobalShortcuts() {
  const router = useRouter();
  const awaitingSecondKey = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (awaitingSecondKey.current) {
        awaitingSecondKey.current = false;
        if (resetTimer.current) clearTimeout(resetTimer.current);
        const href = GO_TO[e.key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (e.key === "g") {
        awaitingSecondKey.current = true;
        resetTimer.current = setTimeout(() => {
          awaitingSecondKey.current = false;
        }, 1000);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [router]);

  return null;
}
