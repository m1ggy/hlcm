"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadTemplateDraft, createDocumentTemplate } from "@/lib/actions/document-templates";
import { AUTO_FIELD_OPTIONS } from "@/lib/merge-fields";

type LicenseType = { id: string; name: string };

type FieldDraft = {
  key: string;
  label: string;
  source: "AUTO" | "CUSTOM";
  autoField: string;
};

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NewDocumentTemplateDialog({ licenseTypes }: { licenseTypes: LicenseType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [licenseTypeTemplateId, setLicenseTypeTemplateId] = useState<string>("");
  const [draft, setDraft] = useState<{ storageKey: string; fileName: string } | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);

  function reset() {
    setStep(1);
    setName("");
    setDescription("");
    setLicenseTypeTemplateId("");
    setDraft(null);
    setFields([]);
  }

  function handleUpload(formData: FormData) {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        const result = await uploadTemplateDraft(formData);
        if (result.tags.length === 0) {
          toast.error("No {merge_tags} found in that file — add at least one before uploading");
          return;
        }
        setDraft({ storageKey: result.storageKey, fileName: result.fileName });
        setFields(
          result.tags.map((key) => ({ key, label: humanize(key), source: "CUSTOM" as const, autoField: "" }))
        );
        setStep(2);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    });
  }

  function handleCreate() {
    if (!draft) return;
    const missingAuto = fields.find((f) => f.source === "AUTO" && !f.autoField);
    if (missingAuto) {
      toast.error(`Pick a data source for "${missingAuto.label}"`);
      return;
    }
    startTransition(async () => {
      try {
        await createDocumentTemplate({
          name,
          description: description || undefined,
          licenseTypeTemplateId: licenseTypeTemplateId || undefined,
          storageKey: draft.storageKey,
          fileName: draft.fileName,
          fields: fields.map(({ key, label, source, autoField }) => ({
            key,
            label,
            source,
            autoField: source === "AUTO" ? autoField : undefined,
          })),
        });
        toast.success("Document template created");
        setOpen(false);
        reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create template");
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
      <DialogTrigger render={<Button>New Document Template</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Document Template</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <form action={handleUpload} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. CILA Handbook"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Applies to license type</Label>
              <Select
                items={{ "": "Any license type", ...Object.fromEntries(licenseTypes.map((lt) => [lt.id, lt.name])) }}
                value={licenseTypeTemplateId}
                onValueChange={(v) => setLicenseTypeTemplateId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any license type</SelectItem>
                  {licenseTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="file">Template file (.docx with {"{merge_tags}"})</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".docx"
                required
                className="h-9 w-full rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-9 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Scanning..." : "Next: Map Fields"}
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found {fields.length} merge tag{fields.length === 1 ? "" : "s"} in {draft?.fileName}. Map each to an
              auto-filled value, or leave as a prompt the VA fills in when generating.
            </p>
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {fields.map((field, i) => (
                <div key={field.key} className="space-y-2 rounded-lg border p-3">
                  <div className="font-mono text-xs text-muted-foreground">{"{" + field.key + "}"}</div>
                  <Input
                    value={field.label}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = { ...next[i], label: e.target.value };
                      setFields(next);
                    }}
                    placeholder="Label"
                  />
                  <div className="flex items-center gap-2">
                    <Select
                      items={{ CUSTOM: "Prompt when generating", AUTO: "Auto-fill" }}
                      value={field.source}
                      onValueChange={(v) => {
                        const next = [...fields];
                        next[i] = { ...next[i], source: (v ?? "CUSTOM") as "AUTO" | "CUSTOM" };
                        setFields(next);
                      }}
                    >
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUSTOM">Prompt when generating</SelectItem>
                        <SelectItem value="AUTO">Auto-fill</SelectItem>
                      </SelectContent>
                    </Select>
                    {field.source === "AUTO" && (
                      <Select
                        items={Object.fromEntries(AUTO_FIELD_OPTIONS.map((f) => [f.key, f.label]))}
                        value={field.autoField}
                        onValueChange={(v) => {
                          const next = [...fields];
                          next[i] = { ...next[i], autoField: v ?? "" };
                          setFields(next);
                        }}
                      >
                        <SelectTrigger size="sm" className="flex-1">
                          <SelectValue placeholder="Choose source" />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTO_FIELD_OPTIONS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={isPending}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={isPending}>
                {isPending ? "Creating..." : "Create Template"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
