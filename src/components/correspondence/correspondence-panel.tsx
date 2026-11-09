"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Camera, Eye, FileText, Mail, MessageSquare, MoreHorizontal, Pencil, Phone, Plus, ScrollText, Trash2 } from "lucide-react";
import { deleteCorrespondenceAction, listCorrespondenceAction } from "@/lib/actions/correspondence";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { browserTimezone } from "@/lib/time-entries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CorrespondenceDialog, type CorrespondenceParent } from "./correspondence-dialog";
import { DIRECTION_LABELS, KIND_LABELS, type CorrespondenceKind, type CorrespondenceRow } from "./correspondence-types";

// The correspondence timeline on an application or a task, newest first
// (docs/client-portal-eod-plan.md, Phase B).

const ICONS: Record<CorrespondenceKind, typeof Mail> = {
  EMAIL: Mail,
  SCREENSHOT: Camera,
  LETTER: ScrollText,
  PHONE_CALL: Phone,
  PORTAL_MESSAGE: MessageSquare,
  OTHER: FileText,
};

// In the person's working timezone, so the server-rendered page and the browser agree.
const when = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });

export function CorrespondencePanel({
  parent,
  initial,
  canAdd,
  currentUserId,
  canManage,
  timeZone,
  showTask = false,
}: {
  parent: CorrespondenceParent;
  /** Already loaded by the page; left out, the panel loads it (the task dialog). */
  initial?: CorrespondenceRow[];
  canAdd: boolean;
  /** Left out with `initial`: taken from the loaded timeline. */
  currentUserId?: string;
  /** Management: may change anyone's entries. */
  canManage?: boolean;
  /** The person's working timezone; left out with `initial`, taken from the loaded timeline. */
  timeZone?: string;
  /** On an application's timeline, name the task an entry was filed on. */
  showTask?: boolean;
}) {
  const [rows, setRows] = useState<CorrespondenceRow[] | null>(initial ?? null);
  const [me, setMe] = useState({ userId: currentUserId ?? "", canManage: Boolean(canManage), timeZone: timeZone ?? "" });
  const zone = me.timeZone || browserTimezone();
  const [editing, setEditing] = useState<CorrespondenceRow | null>(null);
  const [open, setOpen] = useState(false);
  const [, startDelete] = useTransition();
  const parentKey = "taskId" in parent ? `t:${parent.taskId}` : `a:${parent.applicationId}`;

  useEffect(() => {
    if (initial) return;
    let live = true;
    listCorrespondenceAction("taskId" in parent ? { taskId: parent.taskId } : { applicationId: parent.applicationId }).then(
      (r) => {
        if (!live) return;
        if (!r.ok) {
          toast.error(r.error);
          setRows([]);
          return;
        }
        setRows(r.data.rows);
        setMe(r.data.me);
      },
      () => live && setRows([])
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the parent changes
  }, [parentKey]);

  function saved(row: CorrespondenceRow) {
    setRows((current) => {
      const rest = (current ?? []).filter((r) => r.id !== row.id);
      return [...rest, row].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
    });
  }

  function remove(row: CorrespondenceRow) {
    if (!window.confirm(`Delete "${row.subject}" and its attachments?`)) return;
    startDelete(async () => {
      try {
        const result = await deleteCorrespondenceAction(row.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows((current) => (current ?? []).filter((r) => r.id !== row.id));
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't delete that"));
      }
    });
  }

  return (
    <div className="space-y-3" data-tour="correspondence">
      {canAdd && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-3.5" /> Add correspondence
          </Button>
        </div>
      )}

      {rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No correspondence yet.{canAdd ? " Add the emails, letters and calls about this here." : ""}
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <Entry
              key={row.id}
              row={row}
              timeZone={zone}
              showTask={showTask}
              canChange={canAdd && (me.canManage || row.createdBy.id === me.userId)}
              onEdit={() => {
                setEditing(row);
                setOpen(true);
              }}
              onDelete={() => remove(row)}
            />
          ))}
        </ol>
      )}

      <CorrespondenceDialog open={open} onOpenChange={setOpen} parent={parent} entry={editing} timeZone={zone} onSaved={saved} />
    </div>
  );
}

function Entry({
  row,
  timeZone,
  showTask,
  canChange,
  onEdit,
  onDelete,
}: {
  row: CorrespondenceRow;
  timeZone: string;
  showTask: boolean;
  canChange: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICONS[row.kind];
  const Arrow = row.direction === "OUTBOUND" ? ArrowUpRight : row.direction === "INBOUND" ? ArrowDownLeft : null;
  const parties = [row.fromParty && `From ${row.fromParty}`, row.toParty && `to ${row.toParty}`].filter(Boolean).join(" ");
  const long = (row.body?.length ?? 0) > 280 || (row.body?.split("\n").length ?? 0) > 4;
  const images = row.attachments.filter((a) => a.mimeType.startsWith("image/"));
  const others = row.attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" title={KIND_LABELS[row.kind]}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-medium break-words">{row.subject}</p>
            {canChange && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Actions for ${row.subject}`} />}>
                  <MoreHorizontal className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              {Arrow && <Arrow className="size-3" />}
              {DIRECTION_LABELS[row.direction]} {when(row.occurredAt, timeZone)}
            </span>
            {parties && <span className="min-w-0 truncate">· {parties}</span>}
            {showTask && row.task && <span>· on {row.task.label}</span>}
            {row.clientVisible && (
              <Badge variant="secondary" className="gap-1">
                <Eye className="size-3" /> Shared with client
              </Badge>
            )}
          </div>
          {row.body && (
            <div className="text-sm">
              <p className={expanded ? "whitespace-pre-wrap" : "line-clamp-3 whitespace-pre-wrap"}>{row.body}</p>
              {long && (
                <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {images.map((a) => (
                <a key={a.id} href={`/api/files/${a.id}?inline=1`} target="_blank" rel="noreferrer" title={a.fileName} className="block overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private, authenticated file */}
                  <img src={`/api/files/${a.id}?inline=1`} alt={a.fileName} className="h-20 w-auto max-w-40 object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {others.map((a) => (
                <li key={a.id}>
                  <a href={`/api/files/${a.id}`} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
                    <FileText className="size-3" /> <span className="max-w-48 truncate">{a.fileName}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Added by {row.createdBy.name}</p>
        </div>
      </div>
    </li>
  );
}
