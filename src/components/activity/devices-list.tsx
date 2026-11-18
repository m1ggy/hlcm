"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { revokeAgentDevice } from "@/lib/actions/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Device = {
  id: string;
  name: string;
  os: string;
  appVersion: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const OS_LABEL: Record<string, string> = { win32: "Windows", darwin: "Mac" };

function when(iso: string | null, timeZone: string) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone }) : "never";
}

/** Desktop app installs; revoking signs that computer out on its next request. */
export function DevicesList({ devices, timeZone, canRevoke }: { devices: Device[]; timeZone: string; canRevoke: boolean }) {
  const [isPending, startTransition] = useTransition();

  function revoke(device: Device) {
    if (!confirm(`Sign ${device.name} out of the desktop app? They'll need to sign in again on that computer.`)) return;
    startTransition(async () => {
      try {
        await revokeAgentDevice(device.id);
        toast.success(`${device.name} signed out`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to sign out device");
      }
    });
  }

  if (devices.length === 0) return <p className="text-sm text-muted-foreground">The desktop app hasn&apos;t been signed in on any computer.</p>;

  return (
    <ul className="divide-y text-sm">
      {devices.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div>
            <div className="font-medium">
              {d.name} <span className="font-normal text-muted-foreground">· {OS_LABEL[d.os] ?? d.os} · v{d.appVersion}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Signed in {when(d.createdAt, timeZone)} · last seen {when(d.lastSeenAt, timeZone)}
            </div>
          </div>
          {d.revokedAt ? (
            <Badge variant="outline">Signed out</Badge>
          ) : (
            canRevoke && (
              <Button variant="outline" size="sm" onClick={() => revoke(d)} loading={isPending}>
                Sign out
              </Button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
