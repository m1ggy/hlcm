"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Monitor, Smartphone, Tablet, Ban } from "lucide-react";
import {
  getLoginHistory,
  setMobileLoginBlocked,
  type LoginHistoryEvent,
  type LoginSummary,
} from "@/lib/actions/login-activity";
import { effectiveTimezone } from "@/lib/time-entries";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DEVICE_ICON = { DESKTOP: Monitor, MOBILE: Smartphone, TABLET: Tablet } as const;
const DEVICE_LABEL = { DESKTOP: "Computer", MOBILE: "Phone", TABLET: "Tablet" } as const;

function describe(e: { browser: string | null; os: string | null }) {
  return [e.browser, e.os].filter(Boolean).join(" · ") || "Unknown browser";
}

function formatWhen(date: Date | string, timeZone: string | null) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: effectiveTimezone(timeZone),
  });
}

/**
 * Users table cell, DEVELOPER only: how this person last signed in, and a
 * dialog with their recent sign-ins plus the switch that blocks phone/tablet
 * sign-in.
 */
export function LoginActivityCell({
  userId,
  userName,
  summary,
  viewerTimezone,
}: {
  userId: string;
  userName: string;
  summary: LoginSummary | undefined;
  viewerTimezone: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<LoginHistoryEvent[] | null>(null);
  const [blocked, setBlocked] = useState(summary?.mobileLoginBlocked ?? false);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const last = summary?.lastLogin ?? null;
  const Icon = last ? DEVICE_ICON[last.deviceType] : null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setBlocked(summary?.mobileLoginBlocked ?? false);
    startLoading(async () => {
      try {
        setHistory(await getLoginHistory(userId));
      } catch {
        toast.error("Couldn't load sign-in history");
      }
    });
  }

  function toggleBlocked(next: boolean) {
    setBlocked(next);
    startSaving(async () => {
      try {
        await setMobileLoginBlocked({ userId, blocked: next });
        toast.success(next ? "Phone & tablet sign-in turned off" : "Phone & tablet sign-in turned on");
        router.refresh();
      } catch (error) {
        setBlocked(!next);
        toast.error(error instanceof Error ? error.message : "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded text-left text-sm hover:underline"
            title="Sign-in history"
          />
        }
      >
        {last && Icon ? (
          <>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex flex-col leading-tight">
              <span>{describe(last)}</span>
              <span className="text-xs text-muted-foreground">{formatWhen(last.createdAt, viewerTimezone)}</span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
        {summary?.mobileLoginBlocked && (
          <Ban className="size-3.5 shrink-0 text-destructive" aria-label="Mobile sign-in blocked" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sign-ins: {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={blocked}
              onCheckedChange={(c) => toggleBlocked(c === true)}
              disabled={saving}
              className="mt-0.5"
            />
            <span>
              Block sign-in from phones and tablets
              <span className="block text-xs text-muted-foreground">
                They can still sign in from a computer. If they&apos;re signed in on a phone right now, that
                session ends within a minute. Detection uses the browser&apos;s user agent, so a phone set to
                &quot;Request desktop site&quot; can get through.
              </span>
            </span>
          </label>

          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !history && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                )}
                {history?.map((e) => {
                  const RowIcon = DEVICE_ICON[e.deviceType];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatWhen(e.createdAt, viewerTimezone)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <RowIcon className="size-3.5 text-muted-foreground" />
                          {DEVICE_LABEL[e.deviceType]}
                        </span>
                      </TableCell>
                      <TableCell>{describe(e)}</TableCell>
                      <TableCell>{e.method === "password+mfa" ? "Password + MFA" : "Password"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.ipAddress ?? "—"}</TableCell>
                      <TableCell>
                        {e.success ? null : (
                          <Badge variant="destructive">{e.reason === "mobile_blocked" ? "Blocked" : "Failed"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {history && history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No sign-ins recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
