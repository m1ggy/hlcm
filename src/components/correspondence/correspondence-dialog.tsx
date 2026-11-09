"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Mail, Paperclip, X } from "lucide-react";
import { createCorrespondenceAction, previewEmailAction, removeCorrespondenceFileAction, updateCorrespondenceAction } from "@/lib/actions/correspondence";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";
import { cn } from "@/lib/utils";
import { toDatetimeLocalValue, zonedInputToISOString } from "@/lib/time-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/components/files/format-bytes";
import {
  DIRECTION_LABELS,
  KIND_LABELS,
  type CorrespondenceDirection,
  type CorrespondenceKind,
  type CorrespondenceRow,
} from "./correspondence-types";

// Add or edit one correspondence entry (docs/client-portal-eod-plan.md,
// Phase B). Drop or pick files, paste a screenshot straight in, or drop an
// .eml/.msg: its subject, people, date and body fill the form, and its
// attachments are kept with it.

const isEmail = (f: File) => /\.(eml|msg)$/i.test(f.name);
const pad = (n: number) => String(n).padStart(2, "0");

export type CorrespondenceParent = { applicationId: string } | { taskId: string };

export function CorrespondenceDialog({
  open,
  onOpenChange,
  parent,
  entry,
  timeZone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parent: CorrespondenceParent;
  /** Editing this entry; otherwise adding a new one. */
  entry?: CorrespondenceRow | null;
  /** The person's working timezone: the date field reads and writes in it. */
  timeZone: string;
  onSaved: (row: CorrespondenceRow) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Remounted per open, so the form starts fresh each time. */}
        {open && <Form parent={parent} entry={entry ?? null} timeZone={timeZone} onSaved={onSaved} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  parent,
  entry,
  timeZone,
  onSaved,
  onClose,
}: {
  parent: CorrespondenceParent;
  entry: CorrespondenceRow | null;
  timeZone: string;
  onSaved: (row: CorrespondenceRow) => void;
  onClose: () => void;
}) {
  const localInput = (d: Date) => toDatetimeLocalValue(d, timeZone);
  const [kind, setKind] = useState<CorrespondenceKind>(entry?.kind ?? "EMAIL");
  const [direction, setDirection] = useState<CorrespondenceDirection>(entry?.direction ?? "INBOUND");
  const [subject, setSubject] = useState(entry?.subject ?? "");
  const [fromParty, setFromParty] = useState(entry?.fromParty ?? "");
  const [toParty, setToParty] = useState(entry?.toParty ?? "");
  const [occurredAt, setOccurredAt] = useState(() => localInput(entry ? new Date(entry.occurredAt) : new Date()));
  const [body, setBody] = useState(entry?.body ?? "");
  const [clientVisible, setClientVisible] = useState(entry?.clientVisible ?? false);
  const [files, setFiles] = useState<File[]>([]);
  const [emailFile, setEmailFile] = useState<File | null>(null);
  const [emailAttachments, setEmailAttachments] = useState<string[]>([]);
  const [existing, setExisting] = useState(entry?.attachments ?? []);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, startSaving] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  async function readEmail(file: File) {
    setReading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await previewEmailAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const mail = result.data;
      setEmailFile(file);
      setEmailAttachments(mail.attachmentNames);
      setKind("EMAIL");
      // The email fills the form; anything already typed wins.
      setSubject((v) => v || mail.subject);
      setFromParty((v) => v || mail.fromParty || "");
      setToParty((v) => v || mail.toParty || "");
      setBody((v) => v || mail.body || "");
      if (mail.occurredAt) setOccurredAt(localInput(new Date(mail.occurredAt)));
    } catch (error) {
      toast.error(unexpectedErrorMessage(error, "Couldn't read that email"));
    } finally {
      setReading(false);
    }
  }

  function add(list: File[]) {
    const tooBig = list.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(fileTooLargeMessage(tooBig.name));
      return;
    }
    const email = !entry && !emailFile ? list.find(isEmail) : undefined;
    if (email) void readEmail(email);
    const rest = list.filter((f) => f !== email);
    if (rest.length === 0) return;
    // A screenshot on its own: call it one.
    if (!entry && !email && files.length === 0 && rest.every((f) => f.type.startsWith("image/")) && kind === "EMAIL" && !subject) setKind("SCREENSHOT");
    setFiles((current) => [...current, ...rest]);
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    const stamp = new Date();
    // Clipboard images all arrive as "image.png" — give them a findable name.
    add(
      pasted.map((f, i) =>
        f.type.startsWith("image/") && /^image\.\w+$/.test(f.name)
          ? new File([f], `screenshot-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pasted.length > 1 ? `-${i + 1}` : ""}.png`, { type: f.type })
          : f
      )
    );
  }

  function removeExisting(fileId: string) {
    if (!entry) return;
    startSaving(async () => {
      const result = await removeCorrespondenceFileAction(entry.id, fileId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setExisting(result.data.attachments);
      onSaved(result.data);
    });
  }

  function save() {
    const form = new FormData();
    if ("taskId" in parent) form.set("taskId", parent.taskId);
    else form.set("applicationId", parent.applicationId);
    form.set("kind", kind);
    form.set("direction", direction);
    form.set("subject", subject);
    form.set("fromParty", fromParty);
    form.set("toParty", toParty);
    if (occurredAt) form.set("occurredAt", zonedInputToISOString(occurredAt, timeZone));
    form.set("body", body);
    form.set("clientVisible", String(clientVisible));
    for (const f of files) form.append("files", f);
    if (emailFile) form.set("emailFile", emailFile);
    startSaving(async () => {
      try {
        const result = entry ? await updateCorrespondenceAction(entry.id, form) : await createCorrespondenceAction(form);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(entry ? "Saved" : "Added");
        onSaved(result.data);
        onClose();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save that. Please try again."));
      }
    });
  }

  const call = kind === "PHONE_CALL";
  return (
    <form
      className="space-y-4"
      onPaste={onPaste}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>{entry ? "Edit correspondence" : "Add correspondence"}</DialogTitle>
        <DialogDescription>
          {entry ? "Change the details, or add more files." : "Drop an email file (.eml or .msg) to fill this in, paste a screenshot, or type a summary."}
        </DialogDescription>
      </DialogHeader>

      <div
        role="button"
        tabIndex={0}
        aria-label="Add files: drop, paste or pick"
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-5 text-center text-sm text-muted-foreground transition-colors outline-none focus-visible:border-ring",
          dragging && "border-primary bg-primary/5"
        )}
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            picker.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files));
        }}
      >
        <ImagePlus className="size-5" />
        <span>
          {reading ? "Reading the email…" : <>Drop files here, <span className="font-medium text-foreground">paste a screenshot</span> (Ctrl+V), or click to pick</>}
        </span>
        <input
          ref={picker}
          type="file"
          multiple
          className="hidden"
          data-testid="correspondence-files"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {(emailFile || files.length > 0 || existing.length > 0) && (
        <ul className="space-y-1 text-sm">
          {emailFile && (
            <li className="flex items-center gap-2 rounded-md border px-2 py-1">
              <Mail className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{emailFile.name}</span>
              <span className="text-xs text-muted-foreground">
                {emailAttachments.length ? `+ ${emailAttachments.length} attachment${emailAttachments.length === 1 ? "" : "s"}` : "email"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${emailFile.name}`}
                onClick={() => {
                  setEmailFile(null);
                  setEmailAttachments([]);
                }}
              >
                <X className="size-3" />
              </Button>
            </li>
          )}
          {existing.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
              <FileText className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${f.fileName}`} disabled={saving} onClick={() => removeExisting(f.id)}>
                <X className="size-3" />
              </Button>
            </li>
          ))}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1">
              <Paperclip className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as CorrespondenceKind)}>
            <SelectTrigger className="w-full" aria-label="Kind">
              <SelectValue>{(v: CorrespondenceKind) => KIND_LABELS[v]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as CorrespondenceKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Direction</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as CorrespondenceDirection)}>
            <SelectTrigger className="w-full" aria-label="Direction">
              <SelectValue>{(v: CorrespondenceDirection) => DIRECTION_LABELS[v]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIRECTION_LABELS) as CorrespondenceDirection[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {DIRECTION_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="corr-when">{direction === "OUTBOUND" ? "Sent" : direction === "INBOUND" ? "Received" : "When"}</Label>
          <Input id="corr-when" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="corr-subject">{call ? "What it was about" : "Subject"}</Label>
        <Input id="corr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={call ? "e.g. Called the state about the inspection date" : "Subject"} maxLength={500} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="corr-from">From</Label>
          <Input id="corr-from" value={fromParty} onChange={(e) => setFromParty(e.target.value)} placeholder="Name or email" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="corr-to">To</Label>
          <Input id="corr-to" value={toParty} onChange={(e) => setToParty(e.target.value)} placeholder="Name or email" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="corr-body">{kind === "EMAIL" ? "Email text" : "Summary"}</Label>
        <Textarea id="corr-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder={call ? "What was said, and what happens next" : "Paste the email text or write a short summary"} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={clientVisible} onCheckedChange={(c) => setClientVisible(Boolean(c))} />
        Share with the client
      </label>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={reading}>
          {entry ? "Save" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}
