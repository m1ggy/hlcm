"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, Copy, Eye, GitBranch, GripVertical, Monitor, Plus, Smartphone, Trash2, X } from "lucide-react";
import { saveFormTemplate } from "@/lib/actions/form-templates";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { CLIENT_FIELD_OPTIONS } from "@/lib/form-client-fields";
import { FIELD_TYPE_LABELS, SHOW_IF_OPS, hasOptions, isLayoutField, type FormFieldDef, type FormFieldType, type ShowIf } from "@/lib/form-logic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormRenderer } from "./form-renderer";

// The form builder (docs/forms-plan.md, Phase 2): a full page instead of
// the old Admin dialog. Questions on the left (drag to reorder, click one to
// edit it), the form exactly as people will see it on the right.

const CLIENT_FIELD_LABELS: Record<(typeof CLIENT_FIELD_OPTIONS)[number], string> = {
  name: "Client name",
  contactInfo: "Contact info",
  address: "Address",
  businessName: "Business name",
  businessPhone: "Business phone",
  businessEmail: "Business email",
};
const NONE = "__none__";

const ADD_GROUPS: { label: string; types: FormFieldType[] }[] = [
  { label: "Answers", types: ["TEXT", "LONG_TEXT", "EMAIL", "PHONE", "NUMBER", "DATE"] },
  { label: "Choices", types: ["RADIO", "MULTI_CHECKBOX", "SELECT", "CHECKBOX"] },
  { label: "Other", types: ["FILE", "HEADING", "PARAGRAPH"] },
];

type Draft = {
  uid: string;
  /** Set for questions that already exist — their key never changes, so past answers stay matched. */
  key: string | null;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
  clientField: string;
  helpText: string;
  placeholder: string;
  showIf: { uid: string; op: ShowIf["op"]; value: string } | null;
};

export type BuilderTemplate = {
  id: string | null;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  thankYouMessage: string | null;
  sendCopyToSubmitter: boolean;
  notifyUserIds: string[];
  notifyEmails: string | null;
  notifyTextUserIds: string[];
  submissionCount: number;
  fields: { key: string; label: string; type: FormFieldType; required: boolean; options: string[]; clientField: string | null; helpText: string | null; placeholder: string | null; showIf: ShowIf | null }[];
};

export type StaffOption = { id: string; name: string; canText: boolean };

let uidSeq = 0;
const newUid = () => `q${++uidSeq}-${Math.random().toString(36).slice(2, 7)}`;

const slugify = (v: string, sep: "-" | "_") =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");

function blank(type: FormFieldType): Draft {
  return {
    uid: newUid(),
    key: null,
    label: type === "HEADING" ? "New section" : type === "PARAGRAPH" ? "Some text for the person filling this in." : "",
    type,
    required: false,
    options: hasOptions(type) ? ["Option 1", "Option 2"] : [],
    clientField: NONE,
    helpText: "",
    placeholder: "",
    showIf: null,
  };
}

/** Keys for every question: existing ones keep theirs, new ones come from the label (unique). */
function assignKeys(drafts: Draft[]): Map<string, string> {
  const used = new Set(drafts.filter((d) => d.key).map((d) => d.key!));
  const out = new Map<string, string>();
  let section = 0;
  for (const d of drafts) {
    if (d.key) {
      out.set(d.uid, d.key);
      continue;
    }
    const base = isLayoutField(d.type) ? `section_${++section}` : slugify(d.label, "_").slice(0, 50) || d.type.toLowerCase();
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
    used.add(key);
    out.set(d.uid, key);
  }
  return out;
}

function toDefs(drafts: Draft[]): FormFieldDef[] {
  const keys = assignKeys(drafts);
  return drafts.map((d) => ({
    key: keys.get(d.uid)!,
    label: d.label,
    type: d.type,
    required: d.required,
    options: d.options.map((o) => o.trim()).filter(Boolean),
    helpText: d.helpText || null,
    placeholder: d.placeholder || null,
    showIf: d.showIf && keys.get(d.showIf.uid) ? { key: keys.get(d.showIf.uid)!, op: d.showIf.op, value: d.showIf.value } : null,
  }));
}

export function FormBuilder({ initial, staff, textingReady }: { initial: BuilderTemplate; staff: StaffOption[]; textingReady: boolean }) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    name: initial.name,
    slug: initial.slug,
    slugTouched: Boolean(initial.id),
    description: initial.description ?? "",
    active: initial.active,
    thankYouMessage: initial.thankYouMessage ?? "",
    sendCopyToSubmitter: initial.sendCopyToSubmitter,
    notifyUserIds: initial.notifyUserIds,
    notifyEmails: initial.notifyEmails ?? "",
    notifyTextUserIds: initial.notifyTextUserIds,
  });
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const uids = new Map(initial.fields.map((f) => [f.key, newUid()]));
    const list = initial.fields.map((f) => ({
      uid: uids.get(f.key)!,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      clientField: f.clientField ?? NONE,
      helpText: f.helpText ?? "",
      placeholder: f.placeholder ?? "",
      showIf: f.showIf && uids.get(f.showIf.key) ? { uid: uids.get(f.showIf.key)!, op: f.showIf.op, value: f.showIf.value ?? "" } : null,
    }));
    return list.length ? list : [{ ...blank("TEXT"), label: "Your name", required: true }, { ...blank("EMAIL"), label: "Email", required: true }];
  });
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [dirty, setDirty] = useState(!initial.id);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setM = (patch: Partial<typeof meta>) => (setMeta((m) => ({ ...m, ...patch })), setDirty(true));
  const update = (uid: string, patch: Partial<Draft>) => (setDrafts((list) => list.map((d) => (d.uid === uid ? { ...d, ...patch } : d))), setDirty(true));
  const defs = useMemo(() => toDefs(drafts), [drafts]);

  function add(type: FormFieldType, after?: string) {
    const d = blank(type);
    setDrafts((list) => {
      const at = after ? list.findIndex((x) => x.uid === after) + 1 : list.length;
      return [...list.slice(0, at), d, ...list.slice(at)];
    });
    setOpenUid(d.uid);
    setDirty(true);
  }
  function duplicate(uid: string) {
    const src = drafts.find((d) => d.uid === uid);
    if (!src) return;
    const copy = { ...src, uid: newUid(), key: null, label: `${src.label} (copy)`, options: [...src.options] };
    setDrafts((list) => {
      const at = list.findIndex((x) => x.uid === uid) + 1;
      return [...list.slice(0, at), copy, ...list.slice(at)];
    });
    setOpenUid(copy.uid);
    setDirty(true);
  }
  function remove(uid: string) {
    const dependents = drafts.filter((d) => d.showIf?.uid === uid);
    if (dependents.length && !window.confirm(`${dependents.length} question(s) only show based on this one. Remove it and always show them?`)) return;
    setDrafts((list) => list.filter((d) => d.uid !== uid).map((d) => (d.showIf?.uid === uid ? { ...d, showIf: null } : d)));
    setDirty(true);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setDrafts((list) => {
      const from = list.findIndex((d) => d.uid === e.active.id);
      const to = list.findIndex((d) => d.uid === e.over!.id);
      const next = arrayMove(list, from, to);
      // A condition must point at a question above it; drop any that no longer do.
      return next.map((d, i) => (d.showIf && next.findIndex((x) => x.uid === d.showIf!.uid) >= i ? { ...d, showIf: null } : d));
    });
    setDirty(true);
  }

  function save() {
    const keys = assignKeys(drafts);
    const payload = {
      name: meta.name,
      slug: meta.slug,
      description: meta.description,
      active: meta.active,
      thankYouMessage: meta.thankYouMessage,
      sendCopyToSubmitter: meta.sendCopyToSubmitter,
      notifyUserIds: meta.notifyUserIds,
      notifyEmails: meta.notifyEmails,
      notifyTextUserIds: meta.notifyTextUserIds,
      fields: drafts.map((d) => ({
        key: keys.get(d.uid)!,
        label: d.label,
        type: d.type,
        required: d.required,
        options: d.options.map((o) => o.trim()).filter(Boolean),
        clientField: d.clientField === NONE ? null : (d.clientField as (typeof CLIENT_FIELD_OPTIONS)[number]),
        helpText: d.helpText,
        placeholder: d.placeholder,
        showIf: d.showIf && keys.get(d.showIf.uid) ? { key: keys.get(d.showIf.uid)!, op: d.showIf.op, value: d.showIf.value } : null,
      })),
    };
    startSaving(async () => {
      try {
        const r = await saveFormTemplate(initial.id, payload);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setDirty(false);
        // Questions saved for the first time now have fixed keys.
        setDrafts((list) => list.map((d) => ({ ...d, key: keys.get(d.uid)! })));
        toast.success(initial.id ? "Form saved" : "Form created");
        if (!initial.id) router.replace(`/intake/forms/${r.data.id}`);
        else router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the form"));
      }
    });
  }

  const answerable = (beforeIndex: number) => drafts.slice(0, beforeIndex).filter((d) => !isLayoutField(d.type) && d.type !== "FILE");
  const hasEmail = drafts.some((d) => d.type === "EMAIL");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/intake/forms" aria-label="All forms" />}>
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight">{meta.name || "New form"}</h1>
          <Badge variant={meta.active ? "default" : "secondary"}>{meta.active ? "Live" : "Off"}</Badge>
          {initial.submissionCount > 0 && <span className="text-xs text-muted-foreground">{initial.submissionCount} submissions</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          {initial.id && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/forms/${initial.slug}`} target="_blank" rel="noreferrer" />}>
              <Eye className="size-4" /> Open form
            </Button>
          )}
          <Button onClick={save} loading={saving} disabled={!dirty && Boolean(initial.id)}>
            {initial.id ? "Save" : "Create form"}
          </Button>
        </div>
      </div>

      {/* Phones: switch between editing and the preview. */}
      <div className="flex gap-1 rounded-lg border p-1 lg:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setMobileView(v)} className={cn("flex-1 rounded-md py-1.5 text-sm", mobileView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {v === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn("min-w-0", mobileView === "preview" && "hidden lg:block")}>
          <Tabs defaultValue="questions" className="gap-4">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-3">
              <DndContext id="form-builder" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={drafts.map((d) => d.uid)} strategy={verticalListSortingStrategy}>
                  <ol className="space-y-2">
                    {drafts.map((d, i) => (
                      <QuestionCard
                        key={d.uid}
                        draft={d}
                        index={i}
                        open={openUid === d.uid}
                        onToggle={() => setOpenUid(openUid === d.uid ? null : d.uid)}
                        onChange={(p) => update(d.uid, p)}
                        onDuplicate={() => duplicate(d.uid)}
                        onRemove={() => remove(d.uid)}
                        onAddBelow={(t) => add(t, d.uid)}
                        conditionTargets={answerable(i)}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
              <AddMenu onAdd={(t) => add(t)} />
            </TabsContent>

            <TabsContent value="settings" className="space-y-5">
              <section className="space-y-4 rounded-xl border bg-card p-4">
                <div className="space-y-1">
                  <Label htmlFor="fb-name">Form name</Label>
                  <Input
                    id="fb-name"
                    value={meta.name}
                    onChange={(e) => setM({ name: e.target.value, ...(!meta.slugTouched && { slug: slugify(e.target.value, "-") }) })}
                    placeholder="Home care intake"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fb-slug">Link</Label>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span className="shrink-0">/forms/</span>
                    <Input id="fb-slug" value={meta.slug} onChange={(e) => setM({ slug: slugify(e.target.value, "-"), slugTouched: true })} placeholder="home-care-intake" />
                  </div>
                  {initial.id && initial.slug !== meta.slug && <p className="text-xs text-amber-700 dark:text-amber-400">Changing the link breaks the old one wherever it&apos;s been shared.</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fb-desc">Intro text (optional)</Label>
                  <Textarea id="fb-desc" rows={3} value={meta.description} onChange={(e) => setM({ description: e.target.value })} placeholder="Shown under the title, above the questions" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={meta.active} onCheckedChange={(c) => setM({ active: Boolean(c) })} />
                  Form is live — people with the link can fill it in
                </label>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold">After someone submits</h2>
                <div className="space-y-1">
                  <Label htmlFor="fb-thanks">Thank-you message</Label>
                  <Textarea id="fb-thanks" rows={3} value={meta.thankYouMessage} onChange={(e) => setM({ thankYouMessage: e.target.value })} placeholder="We've received your form and will be in touch." />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={meta.sendCopyToSubmitter} onCheckedChange={(c) => setM({ sendCopyToSubmitter: Boolean(c) })} className="mt-0.5" />
                  <span>
                    Email them a copy of their answers
                    {!hasEmail && <span className="block text-xs text-amber-700 dark:text-amber-400">Add an Email question for this to work.</span>}
                  </span>
                </label>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold">Tell the team</h2>
                <div className="space-y-1">
                  <Label>Notify in the app and by email</Label>
                  <MultiUserSelect items={Object.fromEntries(staff.map((s) => [s.id, s.name]))} value={meta.notifyUserIds} onValueChange={(v) => setM({ notifyUserIds: v })} placeholder="Pick people…" />
                  <Input value={meta.notifyEmails} onChange={(e) => setM({ notifyEmails: e.target.value })} placeholder="Other email addresses, comma-separated" />
                  <p className="text-xs text-muted-foreground">Nobody picked: every owner and admin is notified.</p>
                </div>
                <div className="space-y-1">
                  <Label>Text message</Label>
                  <MultiUserSelect
                    items={Object.fromEntries(staff.map((s) => [s.id, s.canText ? s.name : `${s.name} (no text alerts)`]))}
                    value={meta.notifyTextUserIds}
                    onValueChange={(v) => setM({ notifyTextUserIds: v })}
                    placeholder="Pick people to text…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Texts say the form name, the person&apos;s first name and a link — nothing else they wrote. Each person needs a phone number and &ldquo;Text me about new form submissions&rdquo; turned on in their account.
                  </p>
                  {!textingReady && <p className="text-xs text-amber-700 dark:text-amber-400">Texting isn&apos;t switched on for this server yet, so texts won&apos;t go out until it is.</p>}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>

        <div className={cn("min-w-0 lg:sticky lg:top-4", mobileView === "edit" && "hidden lg:block")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview</p>
            <div className="flex gap-1">
              <Button variant={device === "desktop" ? "secondary" : "ghost"} size="icon-sm" aria-label="Desktop width" onClick={() => setDevice("desktop")}>
                <Monitor className="size-4" />
              </Button>
              <Button variant={device === "phone" ? "secondary" : "ghost"} size="icon-sm" aria-label="Phone width" onClick={() => setDevice("phone")}>
                <Smartphone className="size-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl bg-muted/60 p-3">
            <div className={cn("mx-auto transition-all", device === "phone" ? "max-w-[375px]" : "max-w-2xl")}>
              <FormRenderer key={drafts.length} preview fields={defs} title={meta.name} description={meta.description} thankYouMessage={meta.thankYouMessage || null} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddMenu({ onAdd, label = "Add a question" }: { onAdd: (t: FormFieldType) => void; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="w-full border-dashed" />}>
        <Plus className="size-4" /> {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {ADD_GROUPS.map((g, i) => (
          <div key={g.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
              {g.types.map((t) => (
                <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
                  {FIELD_TYPE_LABELS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuestionCard({
  draft: d,
  index,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
  onAddBelow,
  conditionTargets,
}: {
  draft: Draft;
  index: number;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<Draft>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddBelow: (t: FormFieldType) => void;
  conditionTargets: Draft[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.uid });
  const layout = isLayoutField(d.type);
  const target = d.showIf ? conditionTargets.find((t) => t.uid === d.showIf!.uid) : undefined;
  const id = `qc-${d.uid}`;

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-xl border bg-card", open && "ring-2 ring-primary/30", isDragging && "opacity-60")}>
      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" aria-label={`Move ${d.label || "question"}`} {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{layout ? "" : index + 1}</span>
          <span className={cn("min-w-0 flex-1 truncate text-sm", layout ? "font-semibold" : "font-medium", !d.label && "text-muted-foreground italic")}>
            {d.label || "Untitled question"}
            {d.required && <span className="text-destructive"> *</span>}
          </span>
          {d.showIf && <GitBranch className="size-3.5 shrink-0 text-primary" aria-label="Shown only sometimes" />}
          <span className="shrink-0 text-xs text-muted-foreground">{FIELD_TYPE_LABELS[d.type]}</span>
        </button>
        <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={onDuplicate}>
          <Copy className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-1">
              <Label htmlFor={`${id}-label`}>{d.type === "PARAGRAPH" ? "Text" : d.type === "HEADING" ? "Heading" : "Question"}</Label>
              {d.type === "PARAGRAPH" ? (
                <Textarea id={`${id}-label`} rows={3} value={d.label} onChange={(e) => onChange({ label: e.target.value })} autoFocus />
              ) : (
                <Input id={`${id}-label`} value={d.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. What's your name?" autoFocus />
              )}
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                items={FIELD_TYPE_LABELS}
                value={d.type}
                onValueChange={(v) => {
                  const type = (v ?? d.type) as FormFieldType;
                  onChange({ type, options: hasOptions(type) && d.options.length === 0 ? ["Option 1", "Option 2"] : d.options, ...(isLayoutField(type) && { required: false }) });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADD_GROUPS.flatMap((g) => g.types).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasOptions(d.type) && <OptionsEditor options={d.options} onChange={(options) => onChange({ options })} />}

          {d.type !== "PARAGRAPH" && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-help`}>{d.type === "HEADING" ? "Text under the heading (optional)" : "Help text (optional)"}</Label>
              <Input id={`${id}-help`} value={d.helpText} onChange={(e) => onChange({ helpText: e.target.value })} placeholder="Shown under the question" />
            </div>
          )}
          {["TEXT", "LONG_TEXT", "EMAIL", "PHONE", "NUMBER", "SELECT"].includes(d.type) && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-ph`}>Placeholder (optional)</Label>
              <Input id={`${id}-ph`} value={d.placeholder} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="Example answer shown in the empty box" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {!layout && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={d.required} onCheckedChange={(c) => onChange({ required: Boolean(c) })} /> Required
              </label>
            )}
            {!layout && d.type !== "FILE" && d.type !== "CHECKBOX" && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Fills in
                <Select items={{ [NONE]: "nothing", ...CLIENT_FIELD_LABELS }} value={d.clientField} onValueChange={(v) => onChange({ clientField: v ?? NONE })}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>nothing</SelectItem>
                    {CLIENT_FIELD_OPTIONS.map((cf) => (
                      <SelectItem key={cf} value={cf}>
                        {CLIENT_FIELD_LABELS[cf]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                when you create a client from it
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            {d.showIf ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <GitBranch className="size-4 text-primary" />
                Show only if
                <Select
                  items={Object.fromEntries(conditionTargets.map((t) => [t.uid, t.label || "Untitled"]))}
                  value={d.showIf.uid}
                  onValueChange={(v) => v && onChange({ showIf: { ...d.showIf!, uid: v, value: "" } })}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionTargets.map((t) => (
                      <SelectItem key={t.uid} value={t.uid}>
                        {t.label || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select items={SHOW_IF_OPS} value={d.showIf.op} onValueChange={(v) => v && onChange({ showIf: { ...d.showIf!, op: v as ShowIf["op"] } })}>
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SHOW_IF_OPS) as ShowIf["op"][])
                      .filter((op) => op !== "includes" || target?.type === "MULTI_CHECKBOX")
                      .map((op) => (
                        <SelectItem key={op} value={op}>
                          {SHOW_IF_OPS[op]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {d.showIf.op !== "filled" &&
                  (target && (hasOptions(target.type) || target.type === "CHECKBOX") ? (
                    <Select
                      items={Object.fromEntries((target.type === "CHECKBOX" ? ["yes"] : target.options).map((o) => [o, o === "yes" && target.type === "CHECKBOX" ? "ticked" : o]))}
                      value={d.showIf.value || null}
                      onValueChange={(v) => onChange({ showIf: { ...d.showIf!, value: v ?? "" } })}
                    >
                      <SelectTrigger size="sm" className="w-40">
                        <SelectValue placeholder="Pick…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(target.type === "CHECKBOX" ? ["yes"] : target.options).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o === "yes" && target.type === "CHECKBOX" ? "ticked" : o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-8 w-40" value={d.showIf.value} onChange={(e) => onChange({ showIf: { ...d.showIf!, value: e.target.value } })} placeholder="answer" />
                  ))}
                <Button variant="ghost" size="icon-xs" aria-label="Always show" onClick={() => onChange({ showIf: null })}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : conditionTargets.length ? (
              <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => onChange({ showIf: { uid: conditionTargets[conditionTargets.length - 1].uid, op: "equals", value: "" } })}>
                <GitBranch className="size-4" /> Only show this based on an earlier answer
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Questions further down can be shown based on this one&apos;s answer.</p>
            )}
          </div>

          <div className="flex justify-end">
            <AddMenu onAdd={onAddBelow} label="Add a question below" />
          </div>
        </div>
      )}
    </li>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Options</Label>
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={o}
            aria-label={`Option ${i + 1}`}
            onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onChange([...options.slice(0, i + 1), "", ...options.slice(i + 1)]);
                setTimeout(() => (document.activeElement?.closest("div")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null)?.focus(), 0);
              }
            }}
          />
          <Button variant="ghost" size="icon-sm" aria-label={`Remove option ${i + 1}`} disabled={options.length <= 1} onClick={() => onChange(options.filter((_, j) => j !== i))}>
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...options, ""])}>
        <Plus className="size-3.5" /> Add option
      </Button>
    </div>
  );
}
