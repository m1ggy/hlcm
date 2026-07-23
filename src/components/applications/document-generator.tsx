"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";
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
import { generateDocument } from "@/lib/actions/generated-documents";

type TemplateField = { key: string; label: string; source: "AUTO" | "CUSTOM" };
type Template = { id: string; name: string; fields: TemplateField[] };

export function DocumentGenerator({
  applicationId,
  templates,
}: {
  applicationId: string;
  templates: Template[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const template = templates.find((t) => t.id === templateId);
  const customFields = useMemo(() => template?.fields.filter((f) => f.source === "CUSTOM") ?? [], [template]);

  function handleGenerate() {
    if (!templateId) {
      toast.error("Choose a template");
      return;
    }
    const missing = customFields.find((f) => !customValues[f.key]?.trim());
    if (missing) {
      toast.error(`Fill in "${missing.label}"`);
      return;
    }
    startTransition(async () => {
      try {
        await generateDocument({ applicationId, templateId, customValues });
        toast.success("Document generated");
        setCustomValues({});
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to generate document");
      }
    });
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No document templates apply to this Application.</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label>Template</Label>
        <Select
          items={Object.fromEntries(templates.map((t) => [t.id, t.name]))}
          value={templateId}
          onValueChange={(v) => {
            setTemplateId(v ?? "");
            setCustomValues({});
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {customFields.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
          <Input
            id={`field-${field.key}`}
            value={customValues[field.key] ?? ""}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
        </div>
      ))}

      <Button size="sm" className="w-full" onClick={handleGenerate} disabled={isPending}>
        <FileText className="size-3.5" /> {isPending ? "Generating..." : "Generate"}
      </Button>
    </div>
  );
}
