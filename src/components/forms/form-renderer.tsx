"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isFieldVisible, isLayoutField, validateAnswers, type Answers, type FormFieldDef } from "@/lib/form-logic";

// One form as a person fills it in (docs/forms-plan.md, Phase 3): questions
// appear and disappear with their conditions, problems show under each
// question (on leaving it, and all at once on submit, with the first one
// focused), files drop in several at a time. The builder's live preview
// renders the same component with `preview` (nothing is sent).

const FILE_ACCEPT = "image/*,.pdf,.doc,.docx";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type SubmitOutcome = { ok: true; thankYouMessage?: string | null } | { ok: false; error: string };

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function FormRenderer({
  fields,
  title,
  description,
  preview = false,
  thankYouMessage,
  onSubmit,
}: {
  fields: FormFieldDef[];
  title: string;
  description?: string | null;
  /** Builder preview: behaves the same, sends nothing. */
  preview?: boolean;
  thankYouMessage?: string | null;
  onSubmit?: (answers: Answers, files: Record<string, File[]>) => Promise<SubmitOutcome>;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string | null } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const counts = useMemo(() => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), [files]);
  const errors = useMemo(() => validateAnswers(fields, answers, counts), [fields, answers, counts]);
  const visible = fields.filter((f) => isFieldVisible(f, fields, answers));
  const shownError = (key: string) => (showAll || touched[key] ? errors[key] : undefined);

  const set = (key: string, value: Answers[string]) => setAnswers((a) => ({ ...a, [key]: value }));
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setShowAll(true);
    const firstBad = visible.find((f) => errors[f.key]);
    if (firstBad) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad.key}"] input, [data-field="${firstBad.key}"] textarea, [data-field="${firstBad.key}"] button`)?.focus();
      return;
    }
    if (preview || !onSubmit) {
      setDone({ message: thankYouMessage ?? null });
      return;
    }
    setSending(true);
    try {
      const result = await onSubmit(answers, files);
      if (result.ok) setDone({ message: result.thankYouMessage ?? thankYouMessage ?? null });
      else setServerError(result.error);
    } catch {
      setServerError("Something went wrong sending the form. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center shadow-sm">
        <CheckCircle2 className="size-10 text-primary" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">{done.message ? "Thank you" : "Thanks — you're all set"}</h1>
        <p className="max-w-md text-sm whitespace-pre-wrap text-muted-foreground">{done.message ?? "We've received your form and will be in touch."}</p>
        {preview && (
          <Button variant="outline" size="sm" onClick={() => (setDone(null), setAnswers({}), setFiles({}), setTouched({}), setShowAll(false))}>
            Back to the form
          </Button>
        )}
      </div>
    );
  }

  const problemCount = showAll ? visible.filter((f) => errors[f.key]).length : 0;

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="space-y-6 rounded-2xl border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title || "Untitled form"}</h1>
        {description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{description}</p>}
        {fields.some((f) => f.required && !isLayoutField(f.type)) && (
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Required
          </p>
        )}
      </header>

      {problemCount > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problemCount === 1 ? "One answer needs a look before you send." : `${problemCount} answers need a look before you send.`}
        </div>
      )}

      <div className="space-y-5">
        {visible.map((f) => (
          <FieldBlock
            key={f.key}
            field={f}
            value={answers[f.key]}
            files={files[f.key] ?? []}
            error={shownError(f.key)}
            onChange={(v) => set(f.key, v)}
            onFiles={(list) => (setFiles((cur) => ({ ...cur, [f.key]: list })), touch(f.key))}
            onBlur={() => touch(f.key)}
          />
        ))}
      </div>

      {serverError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {serverError}
        </div>
      )}

      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={sending}>
        {sending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : preview ? (
          "Submit (preview — nothing is sent)"
        ) : (
          "Submit"
        )}
      </Button>
    </form>
  );
}

function FieldBlock({
  field: f,
  value,
  files,
  error,
  onChange,
  onFiles,
  onBlur,
}: {
  field: FormFieldDef;
  value: Answers[string];
  files: File[];
  error?: string;
  onChange: (v: Answers[string]) => void;
  onFiles: (list: File[]) => void;
  onBlur: () => void;
}) {
  const id = `f-${f.key}`;
  const helpId = f.helpText ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(" ") || undefined;
  const text = typeof value === "string" ? value : "";

  if (f.type === "HEADING") {
    return (
      <div className="border-t pt-5 first:border-0 first:pt-0">
        <h2 className="font-heading text-lg font-semibold">{f.label}</h2>
        {f.helpText && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{f.helpText}</p>}
      </div>
    );
  }
  if (f.type === "PARAGRAPH") return <p className="text-sm whitespace-pre-wrap text-muted-foreground">{f.label}</p>;

  const label = (
    <span className="text-sm font-medium">
      {f.label}
      {f.required && (
        <span className="text-destructive" aria-hidden>
          {" "}
          *
        </span>
      )}
    </span>
  );
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": f.required, onBlur };

  return (
    <div data-field={f.key} className="space-y-1.5">
      {f.type === "CHECKBOX" ? (
        <label className="flex items-start gap-3 rounded-lg border px-3 py-3 has-[[data-checked]]:border-primary/50">
          <Checkbox {...common} checked={value === "yes"} onCheckedChange={(c) => onChange(c ? "yes" : undefined)} className="mt-0.5" />
          {label}
        </label>
      ) : (
        f.type === "RADIO" || f.type === "MULTI_CHECKBOX" ? (
          // A group: the question names the group, each option names itself.
          <p id={`${id}-label`} className="block">
            {label}
          </p>
        ) : (
          <label htmlFor={id} id={`${id}-label`} className="block">
            {label}
          </label>
        )
      )}
      {f.helpText && f.type !== "CHECKBOX" && (
        <p id={helpId} className="text-xs whitespace-pre-wrap text-muted-foreground">
          {f.helpText}
        </p>
      )}

      {(f.type === "TEXT" || f.type === "EMAIL" || f.type === "PHONE" || f.type === "NUMBER" || f.type === "DATE") && (
        <Input
          {...common}
          type={f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : f.type === "DATE" ? "date" : "text"}
          inputMode={f.type === "NUMBER" ? "decimal" : f.type === "PHONE" ? "tel" : f.type === "EMAIL" ? "email" : undefined}
          autoComplete={f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : undefined}
          placeholder={f.placeholder ?? undefined}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-11 text-base sm:h-10 sm:text-sm", error && "border-destructive")}
        />
      )}
      {f.type === "LONG_TEXT" && (
        <Textarea {...common} rows={4} placeholder={f.placeholder ?? undefined} value={text} onChange={(e) => onChange(e.target.value)} className={cn("text-base sm:text-sm", error && "border-destructive")} />
      )}
      {f.type === "SELECT" && (
        <Select items={Object.fromEntries(f.options.map((o) => [o, o]))} value={text || null} onValueChange={(v) => (onChange(v ?? undefined), onBlur())}>
          <SelectTrigger {...common} className={cn("h-11 w-full sm:h-10", error && "border-destructive")}>
            <SelectValue placeholder={f.placeholder || "Choose…"} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {(f.type === "RADIO" || f.type === "MULTI_CHECKBOX") && (
        <div role={f.type === "RADIO" ? "radiogroup" : "group"} aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="grid gap-2">
          {f.options.map((o, i) => {
            const list = Array.isArray(value) ? value : [];
            const checked = f.type === "RADIO" ? text === o : list.includes(o);
            const toggle = () => {
              if (f.type === "RADIO") onChange(o);
              else onChange(checked ? list.filter((x) => x !== o) : [...list, o]);
              onBlur();
            };
            return (
              <label key={o} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors", checked && "border-primary/60 bg-primary/5")}>
                <input
                  data-first={i === 0 || undefined}
                  type={f.type === "RADIO" ? "radio" : "checkbox"}
                  name={f.key}
                  checked={checked}
                  onChange={toggle}
                  className="size-4 accent-[var(--primary)]"
                />
                {o}
              </label>
            );
          })}
        </div>
      )}
      {f.type === "FILE" && <FileDrop id={id} files={files} onFiles={onFiles} invalid={Boolean(error)} describedBy={describedBy} />}

      {error && (
        <p id={errId} className="flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="size-3.5" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function FileDrop({ id, files, onFiles, invalid, describedBy }: { id: string; files: File[]; onFiles: (f: File[]) => void; invalid: boolean; describedBy?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const add = (list: File[]) => {
    const tooBig = list.filter((f) => f.size > MAX_FILE_BYTES);
    setNote(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 25MB and wasn't added` : null);
    onFiles([...files, ...list.filter((f) => f.size <= MAX_FILE_BYTES)].slice(0, 10));
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors outline-none focus-visible:border-ring",
          drag && "border-primary bg-primary/5",
          invalid && "border-destructive"
        )}
      >
        <FileUp className="size-5" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Choose files</span> or drop them here
        </span>
        <span className="text-xs">Photos, PDFs or Word documents, up to 25MB each</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {note && <p className="text-xs text-destructive">{note}</p>}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => onFiles(files.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
