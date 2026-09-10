"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { createFormTemplate, updateFormTemplate } from "@/lib/actions/form-templates";
import { CLIENT_FIELD_OPTIONS } from "@/lib/form-client-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FIELD_TYPE_LABELS = {
  TEXT: "Short text",
  LONG_TEXT: "Long text",
  EMAIL: "Email",
  PHONE: "Phone",
  DATE: "Date",
  SELECT: "Dropdown",
  CHECKBOX: "Checkbox",
  FILE: "File upload",
} as const;
type FieldType = keyof typeof FIELD_TYPE_LABELS;
const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];

const CLIENT_FIELD_LABELS: Record<(typeof CLIENT_FIELD_OPTIONS)[number], string> = {
  name: "Client name",
  contactInfo: "Contact info",
  address: "Address",
  businessName: "Business name",
  businessPhone: "Business phone",
  businessEmail: "Business email",
};
const NONE = "__none__";

type FieldDraft = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string; // comma-separated in the UI, split on save
  clientField: string; // NONE or one of CLIENT_FIELD_OPTIONS
};

function slugify(value: string, separator: "-" | "_") {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`(^\\${separator}|\\${separator}$)`, "g"), "");
}

function emptyField(): FieldDraft {
  return { key: "", label: "", type: "TEXT", required: false, options: "", clientField: NONE };
}

type ExistingTemplate = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  fields: { key: string; label: string; type: FieldType; required: boolean; options: string[]; clientField: string | null }[];
};

export function FormTemplateDialog({ template, trigger }: { template?: ExistingTemplate; trigger?: React.ReactElement }) {
  const router = useRouter();
  const isEdit = !!template;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(template?.name ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(template?.description ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [fields, setFields] = useState<FieldDraft[]>(
    template?.fields.length
      ? template.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options.join(", "),
          clientField: f.clientField ?? NONE,
        }))
      : [emptyField()]
  );

  function reset() {
    setName(template?.name ?? "");
    setSlug(template?.slug ?? "");
    setSlugTouched(isEdit);
    setDescription(template?.description ?? "");
    setActive(template?.active ?? true);
    setFields(
      template?.fields.length
        ? template.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options.join(", "),
            clientField: f.clientField ?? NONE,
          }))
        : [emptyField()]
    );
  }

  function handleNameChange(next: string) {
    setName(next);
    if (!slugTouched) setSlug(slugify(next, "-"));
  }

  function updateField(index: number, patch: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((prev) => [...prev, emptyField()]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!slug.trim()) {
      toast.error("Link is required");
      return;
    }
    if (fields.length === 0) {
      toast.error("Add at least one field");
      return;
    }
    for (const f of fields) {
      if (!f.label.trim()) {
        toast.error("Every field needs a label");
        return;
      }
      if (f.type === "SELECT" && !f.options.trim()) {
        toast.error(`"${f.label}" is a dropdown — add at least one option`);
        return;
      }
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      fields: fields.map((f) => ({
        key: f.key.trim() || slugify(f.label, "_"),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === "SELECT" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
        clientField: f.clientField === NONE ? undefined : (f.clientField as (typeof CLIENT_FIELD_OPTIONS)[number]),
      })),
    };

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateFormTemplate(template.id, { ...payload, active });
          toast.success("Form updated");
        } else {
          await createFormTemplate(payload);
          toast.success("Form created");
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save form");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger ?? <Button><Plus className="size-3.5" /> New form</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit form" : "New form"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="form-name">Name</Label>
              <Input id="form-name" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Home Care Intake" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="form-slug">Public link</Label>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="shrink-0">/forms/</span>
                <Input
                  id="form-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value, "-"));
                  }}
                  placeholder="home-care-intake"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="form-description">Description (optional)</Label>
            <Textarea
              id="form-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown at the top of the form, above the fields"
              rows={2}
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
              Active — inactive forms 404 for anyone with the link
            </label>
          )}

          <div className="space-y-2">
            <Label>Fields</Label>
            {fields.map((field, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Field label"
                    />
                    <Select
                      items={FIELD_TYPE_LABELS}
                      value={field.type}
                      onValueChange={(v) => updateField(index, { type: (v ?? field.type) as FieldType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {FIELD_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => moveField(index, -1)} disabled={index === 0} title="Move up">
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                      title="Move down"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeField(index)}
                      disabled={fields.length === 1}
                      title="Remove field"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {field.type === "SELECT" && (
                  <Input
                    value={field.options}
                    onChange={(e) => updateField(index, { options: e.target.value })}
                    placeholder="Options, comma-separated — e.g. Home Care, CILA, MCO"
                  />
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.required} onCheckedChange={(c) => updateField(index, { required: c === true })} />
                    Required
                  </label>
                  {field.type !== "FILE" && field.type !== "CHECKBOX" && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      Fills in
                      <Select
                        items={{ [NONE]: "Nothing (reference only)", ...CLIENT_FIELD_LABELS }}
                        value={field.clientField}
                        onValueChange={(v) => updateField(index, { clientField: v ?? NONE })}
                      >
                        <SelectTrigger size="sm" className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Nothing (reference only)</SelectItem>
                          {CLIENT_FIELD_OPTIONS.map((cf) => (
                            <SelectItem key={cf} value={cf}>
                              {CLIENT_FIELD_LABELS[cf]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      on &quot;Create client&quot;
                    </div>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus className="size-3.5" /> Add field
            </Button>
          </div>

          <Button onClick={handleSubmit} className="w-full" loading={isPending}>
            {isEdit ? "Save changes" : "Create form"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
