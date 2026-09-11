"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// The 15-minute idle session (src/auth.ts) has no client-side signal of its
// own — a tab left open past that just sits there looking normal until the
// next server action/navigation throws or redirects. SessionProvider
// revalidates on window focus by default, so coming back to the tab is
// exactly when this actually fires — catching the "I stepped away, came
// back, and nothing said I'd been logged out" gap directly.
//
// Mount once inside each authenticated layout ((dashboard), (portal)) —
// never at the root, since /login itself is legitimately unauthenticated
// and shouldn't trigger this.
export function SessionExpiredDialog() {
  const { status } = useSession();
  // A one-way latch: once we've seen an authenticated session, remember it
  // for the life of this component so a later "unauthenticated" reading
  // means the session actually expired, not that it just hasn't loaded
  // yet. Set directly during render (guarded so it only ever fires once)
  // rather than in an effect — React's own sanctioned pattern for this,
  // see "Adjusting state when a prop changes" in the React docs.
  const [wasAuthenticated, setWasAuthenticated] = useState(false);
  if (status === "authenticated" && !wasAuthenticated) setWasAuthenticated(true);

  const expired = wasAuthenticated && status === "unauthenticated";

  return (
    <Dialog open={expired}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>You&apos;ve been signed out</DialogTitle>
          <DialogDescription>
            Your session expired from inactivity. Log back in to keep working — anything you had open here is still
            waiting for you.
          </DialogDescription>
        </DialogHeader>
        <Button className="w-full" nativeButton={false} render={<a href="/login" />}>
          Log in again
        </Button>
      </DialogContent>
    </Dialog>
  );
}
