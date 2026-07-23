"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// cmdk (the actual palette UI) is a genuinely heavy dependency for a
// power-user feature most page-loads never touch — it was showing up in
// every dashboard route's JS because this component used to import it
// directly from the persistent layout. Splitting the keydown listener
// (tiny) from the palette UI (dynamically imported, ssr: false) means that
// weight is only ever fetched after the first Cmd+K press, not on every
// navigation.
const CommandPaletteContent = dynamic(() => import("@/components/command-palette-content"), { ssr: false });

export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setHasOpened(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!hasOpened) return null;
  return <CommandPaletteContent isAdmin={isAdmin} open={open} onOpenChange={setOpen} />;
}
