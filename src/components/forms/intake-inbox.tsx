"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Download, FileDown, Inbox, Mail, MessageSquareText, RotateCcw, Search } from "lucide-react";
import { dismissSubmission, markSubmissionReviewed, reopenSubmission, saveSubmissionNote } from "@/lib/actions/form-submissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreateClientFromSubmissionDialog } from "@/components/admin/create-client-from-submission-dialog";
import { AttachSubmissionDialog } from "@/components/admin/attach-submission-dialog";

// The submissions inbox (docs/forms-plan.md, Phase 4): a list you can search
// and filter, and a side panel with everything one person sent.

export type InboxSubmission = {
  id: string;
  createdAt: string;
  status: "PENDING" | "REVIEWED" | "DISMISSED";
  form: { id: string; name: string };
  from: string | null;
  items: { key: string; label: string; value: string }[];
  files: { id: string; fieldKey: string; fileName: string; sizeBytes: number; label: string }[];
  client: { id: string; name: string } | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
  copyEmailedTo: string | null;
  texted: string[];
  defaults: Record<string, string>;
};

const STATUS_LABEL = { PENDING: "New", REVIEWED: "Reviewed", DISMISSED: "Dismissed" } as const;
const STATUS_VARIANT = { PENDING: "default", REVIEWED: "outline", DISMISSED: "secondary" } as const;
const ALL_FORMS = "__all__";

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function IntakeInbox({
  submissions,
  status,
  counts,
  forms,
  formId,
  query,
  openId,
  timeZone,
  clients,
  projects,
}: {
  submissions: InboxSubmission[];
  status: string;
  counts: Record<"PENDING" | "REVIEWED" | "DISMISSED", number>;
  forms: { id: string; name: string }[];
  formId: string | null;
  query: string;
  openId: string | null;
  timeZone: string;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(query);
  const [open, setOpen] = useState<string | null>(openId);
  const when = (iso: string, withTime = true) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", ...(withTime && { hour: "numeric", minute: "2-digit" }), timeZone });

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("open");
    router.push(`${pathname}?${next.toString()}`);
  };

  // Search as you type (a moment after the last key).
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => go({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the text changes
  }, [search]);

  const openOne = (id: string | null) => {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("open", id);
    else url.searchParams.delete("open");
    window.history.replaceState(null, "", url);
  };
  const current = submissions.find((s) => s.id === open) ?? null;
  const exportHref = `/api/export/form-submissions?${new URLSearchParams({ ...(formId && { form: formId }), ...(status !== "all" && { status }) }).toString()}`;

  const chip = (key: string, label: string, n?: number) => (
    <button
      type="button"
      onClick={() => go({ status: key === "PENDING" ? null : key })}
      aria-pressed={status === key}
      className={cn("rounded-full border px-3 py-1 text-xs transition-colors", status === key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
    >
      {label}
      {n !== undefined && <span className="ml-1 tabular-nums opacity-80">{n}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search answers…" aria-label="Search submissions" className="pl-8" />
        </div>
        <Select items={{ [ALL_FORMS]: "All forms", ...Object.fromEntries(forms.map((f) => [f.id, f.name])) }} value={formId ?? ALL_FORMS} onValueChange={(v) => go({ form: v && v !== ALL_FORMS ? v : null })}>
          <SelectTrigger className="w-48" aria-label="Form">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FORMS}>All forms</SelectItem>
            {forms.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5">
          {chip("PENDING", "New", counts.PENDING)}
          {chip("REVIEWED", "Reviewed", counts.REVIEWED)}
          {chip("DISMISSED", "Dismissed", counts.DISMISSED)}
          {chip("all", "All")}
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" nativeButton={false} render={<a href={exportHref} />}>
          <FileDown className="size-4" /> Export CSV
        </Button>
      </div>

      {submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <Inbox className="size-7 text-muted-foreground" aria-hidden />
          <p className="font-medium">{query ? "Nothing matches that search" : status === "PENDING" ? "You're all caught up" : "Nothing here"}</p>
          <p className="text-sm text-muted-foreground">
            {status === "PENDING" && !query ? "New submissions show up here, and you'll get a notification." : "Try another filter."}{" "}
            <Link href="/intake/forms" className="underline underline-offset-4">
              Manage forms
            </Link>
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {submissions.map((s) => {
            const preview = s.items.find((i) => i.value && i.value !== s.from)?.value;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => openOne(s.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50">
                  {s.status === "PENDING" && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.from ?? "No name given"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.form.name}
                      {preview && ` · ${preview}`}
                    </span>
                  </span>
                  {s.client && <span className="text-xs text-muted-foreground">→ {s.client.name}</span>}
                  {s.files.length > 0 && <span className="text-xs text-muted-foreground">{s.files.length} file{s.files.length === 1 ? "" : "s"}</span>}
                  <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">{when(s.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={current !== null} onOpenChange={(o) => !o && openOne(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
          {current && <Detail key={current.id} s={current} when={when} clients={clients} projects={projects} onDone={() => router.refresh()} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({
  s,
  when,
  clients,
  projects,
  onDone,
}: {
  s: InboxSubmission;
  when: (iso: string, withTime?: boolean) => string;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [note, setNote] = useState(s.note ?? "");
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(done);
      onDone();
    });

  return (
    <div className="flex flex-col gap-5 p-6">
      <SheetHeader className="gap-1 p-0">
        <SheetDescription className="text-xs">
          {s.form.name} · {when(s.createdAt)}
        </SheetDescription>
        <SheetTitle className="font-heading text-xl">{s.from ?? "Submission"}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          {s.reviewedBy && s.reviewedAt && (
            <span>
              {s.status === "DISMISSED" ? "Dismissed" : "Reviewed"} by {s.reviewedBy}, {when(s.reviewedAt, false)}
            </span>
          )}
          {s.client && (
            <Link href={`/clients/${s.client.id}`} className="underline underline-offset-4">
              Client: {s.client.name}
            </Link>
          )}
        </div>
      </SheetHeader>

      <dl className="space-y-3">
        {s.items.map((i) => (
          <div key={i.key}>
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className={cn("text-sm whitespace-pre-wrap break-words", !i.value && "text-muted-foreground")}>{i.value || "—"}</dd>
          </div>
        ))}
      </dl>

      {s.files.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Files</p>
          <ul className="space-y-1">
            {s.files.map((f) => (
              <li key={f.id}>
                <a href={`/api/form-submissions/${s.id}/files/${f.id}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted">
                  <Download className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.label} · {fmtSize(f.sizeBytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(s.texted.length > 0 || s.copyEmailedTo) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {s.texted.length > 0 && (
            <p className="flex items-center gap-1.5">
              <MessageSquareText className="size-3.5" /> Texted {s.texted.join(", ")}
            </p>
          )}
          {s.copyEmailedTo && (
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5" /> Copy emailed to {s.copyEmailedTo}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="sub-note" className="text-xs text-muted-foreground">
          Team note (only your team sees it)
        </label>
        <Textarea id="sub-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called back on Tuesday, waiting on their license number…" />
        {note !== (s.note ?? "") && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => saveSubmissionNote(s.id, note), "Note saved")}>
            Save note
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {s.status === "PENDING" ? (
          <>
            <CreateClientFromSubmissionDialog submissionId={s.id} defaults={s.defaults} projects={projects} />
            <AttachSubmissionDialog submissionId={s.id} clients={clients} />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => markSubmissionReviewed(s.id), "Marked reviewed")}>
              <Check className="size-3.5" /> Mark reviewed
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                window.confirm("Dismiss this submission (spam or a duplicate)? Nothing is deleted.") &&
                act(async () => {
                  try {
                    await dismissSubmission(s.id);
                    return { ok: true as const };
                  } catch {
                    return { ok: false as const, error: "Couldn't dismiss it" };
                  }
                }, "Dismissed")
              }
            >
              <Ban className="size-3.5" /> Dismiss
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => reopenSubmission(s.id), "Moved back to New")}>
            <RotateCcw className="size-3.5" /> Move back to New
          </Button>
        )}
      </div>
    </div>
  );
}
