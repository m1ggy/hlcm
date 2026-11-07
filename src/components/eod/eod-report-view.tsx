"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Eye, Lock, RotateCcw } from "lucide-react";
import { commentOnEodAction, reopenEodAction } from "@/lib/actions/eod";
import { TASK_STATUS_LABELS } from "@/lib/task-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { formatMinutes } from "@/lib/eod-format";
import type { EodReportData } from "./eod-types";

// A submitted report, read-only (docs/client-portal-eod-plan.md, Phase C):
// the lines, the day's summary, and the comment thread between the author
// and their managers.

const time = (d: Date) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function EodReportView({ report, canReopen, showAuthor }: { report: EodReportData; canReopen: boolean; showAuthor: boolean }) {
  const router = useRouter();
  const [reopening, startReopen] = useTransition();
  const minutes = report.items.reduce((s, i) => s + (i.minutes ?? 0), 0);

  function reopen() {
    startReopen(async () => {
      const result = await reopenEodAction(report.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Reopened — it's a draft again");
        // The author edits it on their own EOD page; a manager stays here.
        if (!showAuthor) router.push(`/eod?date=${report.reportDate}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {report.status === "SUBMITTED" ? (
            <Badge>Submitted{report.submittedAt ? ` at ${time(report.submittedAt)}` : ""}</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
          {showAuthor && <span className="font-medium">{report.author.name}</span>}
          <span className="text-muted-foreground">
            {report.items.length} {report.items.length === 1 ? "line" : "lines"}
            {minutes ? ` · ${formatMinutes(minutes)}` : ""}
          </span>
          {report.reopenedAt && <span className="text-xs text-muted-foreground">Reopened by {report.reopenedByName ?? "someone"}</span>}
        </p>
        {canReopen && report.status === "SUBMITTED" && (
          <Button variant="outline" size="sm" onClick={reopen} loading={reopening}>
            <RotateCcw className="size-3.5" /> Reopen
          </Button>
        )}
      </div>

      <ol className="space-y-3">
        {report.items.map((l) => {
          const moved = l.taskId && l.statusAfter && l.statusAfter !== l.statusBefore;
          return (
            <li key={l.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">{l.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {moved ? (
                    <span className="flex items-center gap-1">
                      {TASK_STATUS_LABELS[l.statusBefore!]} <ArrowRight className="size-3" /> <span className="font-medium text-foreground">{TASK_STATUS_LABELS[l.statusAfter!]}</span>
                    </span>
                  ) : l.statusAfter ? (
                    <span>{TASK_STATUS_LABELS[l.statusAfter]}</span>
                  ) : (
                    <span>Not on a task</span>
                  )}
                  {l.minutes ? <span className="tabular-nums">{formatMinutes(l.minutes)}</span> : null}
                  {l.clientVisible && (
                    <span className="flex items-center gap-1" title="Shared with the client">
                      <Eye className="size-3" /> Client
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{l.workDone}</p>
              {l.internalNote && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3 shrink-0" /> {l.internalNote}
                </p>
              )}
            </li>
          );
        })}
        {report.items.length === 0 && <li className="text-sm text-muted-foreground">No lines.</li>}
      </ol>

      <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-3">
        <Block label="Summary" text={report.summary} />
        <Block label="Blockers" text={report.blockers} />
        <Block label="Plan for tomorrow" text={report.tomorrowPlan} />
      </section>

      <Comments report={report} />
    </div>
  );
}

function Block({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap">{text || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function Comments({ report }: { report: EodReportData }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  function send() {
    start(async () => {
      const result = await commentOnEodAction(report.id, body);
      if (!result.ok) toast.error(result.error);
      else {
        setBody("");
        router.refresh();
      }
    });
  }
  return (
    <section className="space-y-3" aria-label="Comments">
      <h2 className="font-heading text-lg font-semibold">Comments</h2>
      {report.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      <ul className="space-y-3">
        {report.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <AvatarInitials name={c.author.name} className="size-7 text-[0.65rem]" />
            <div>
              <p className="text-sm">
                <span className="font-medium">{c.author.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </p>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment" aria-label="Comment" rows={2} />
        <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>
          Comment
        </Button>
      </form>
    </section>
  );
}

export function ReportLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link href={`/eod/r/${id}`} className="underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
