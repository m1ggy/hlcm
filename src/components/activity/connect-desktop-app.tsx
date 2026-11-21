"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDesktopConnectLink } from "@/lib/actions/desktop-app";
import { unexpectedErrorMessage } from "@/lib/action-result";

// Opens the installed desktop app with a carenela:// link that signs it in
// to this workspace as the person on this page. If nothing happens, the app
// isn't installed (or is older than 0.4.0); the manual sign-in still works.
export function ConnectDesktopApp({ workspace, connectedDevice }: { workspace: string; connectedDevice: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  // After the link opens the app, re-check every few seconds (for two
  // minutes) so the page turns to "Connected" once the app has signed in.
  useEffect(() => {
    if (!opened || connectedDevice) return;
    const timer = setInterval(() => router.refresh(), 4000);
    const stop = setTimeout(() => clearInterval(timer), 120_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [opened, connectedDevice, router]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const result = await createDesktopConnectLink();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data;
      setOpened(true);
    } catch (e) {
      setError(unexpectedErrorMessage(e, "Couldn't make a connect link. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {connectedDevice && (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4" /> Connected on {connectedDevice}. You&apos;re set: clock in from the tray icon.
        </p>
      )}
      <Button variant={connectedDevice ? "outline" : "default"} onClick={connect} disabled={busy}>
        <Link2 /> {busy ? "Connecting…" : connectedDevice ? "Connect another computer" : "Connect the app to this workspace"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {opened && !connectedDevice && (
        <p className="text-sm text-muted-foreground">
          Your browser may ask to open Carenela: allow it. The app then signs you in by itself; no password needed.
        </p>
      )}
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Nothing happened?</summary>
        <div className="mt-2 space-y-1">
          <p>Make sure the app is installed and running (its icon is in the system tray), then click Connect again.</p>
          <p>
            Or sign in inside the app yourself: for <strong>Workspace</strong> enter{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">{workspace}</code>, then your usual email, password and sign-in code.
          </p>
        </div>
      </details>
    </div>
  );
}
