"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDesktopConnectLink } from "@/lib/actions/desktop-app";
import { unexpectedErrorMessage } from "@/lib/action-result";

// Opens the installed desktop app with a carenela:// link that signs it in
// to this workspace as the person on this page. If nothing happens, the app
// isn't installed (or is older than 0.4.0); the manual sign-in still works.
export function ConnectDesktopApp({ workspace }: { workspace: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

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
      <Button onClick={connect} disabled={busy}>
        <Link2 /> {busy ? "Connecting…" : "Connect the app to this workspace"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {opened && (
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
