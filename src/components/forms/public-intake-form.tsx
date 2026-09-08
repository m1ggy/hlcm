"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { submitForm } from "@/lib/actions/public-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldType = "TEXT" | "LONG_TEXT" | "EMAIL" | "PHONE" | "DATE" | "SELECT" | "CHECKBOX" | "FILE";

type Field = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
};

// Every field's value lives in plain React state — none of the app's own
// input primitives (Select, Checkbox) are native form elements that
// participate in browser FormData collection, so like every other form in
// this app, the FormData sent to the server action is built by hand from
// this state rather than read off the <form> itself.
export function PublicIntakeForm({
  templateId,
  name,
  description,
  fields,
}: {
  templateId: string;
  name: string;
  description: string | null;
  fields: Field[];
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const honeypotRef = useRef<HTMLInputElement>(null);

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    for (const field of fields) {
      if (!field.required) continue;
      if (field.type === "FILE") {
        if (!files[field.key]) {
          toast.error(`"${field.label}" is required`);
          return;
        }
        continue;
      }
      if (field.type === "CHECKBOX") {
        if (values[field.key] !== "on") {
          toast.error(`"${field.label}" must be checked`);
          return;
        }
        continue;
      }
      if (!values[field.key]?.trim()) {
        toast.error(`"${field.label}" is required`);
        return;
      }
    }

    const formData = new FormData();
    formData.set("website", honeypotRef.current?.value ?? "");
    for (const field of fields) {
      if (field.type === "FILE") {
        const file = files[field.key];
        if (file) formData.set(field.key, file);
      } else if (values[field.key] !== undefined) {
        formData.set(field.key, values[field.key]);
      }
    }

    startTransition(async () => {
      try {
        await submitForm(templateId, formData);
        setSubmitted(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to submit — please try again");
      }
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-lg font-medium">Thanks — you&apos;re all set</p>
          <p className="text-sm text-muted-foreground">We&apos;ve received your submission and will be in touch.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Honeypot — visually and from-tab-order hidden from a real visitor
            (not just display:none, some bots skip those), left uncontrolled
            since a real user never touches it. */}
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
          aria-hidden="true"
        />

        {fields.map((field) => (
          <div key={field.id} className="space-y-1">
            {field.type !== "CHECKBOX" && (
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
            )}

            {field.type === "TEXT" && (
              <Input id={field.key} value={values[field.key] ?? ""} onChange={(e) => setValue(field.key, e.target.value)} />
            )}
            {field.type === "EMAIL" && (
              <Input
                id={field.key}
                type="email"
                value={values[field.key] ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}
            {field.type === "PHONE" && (
              <Input
                id={field.key}
                type="tel"
                value={values[field.key] ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}
            {field.type === "DATE" && (
              <Input
                id={field.key}
                type="date"
                value={values[field.key] ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}
            {field.type === "LONG_TEXT" && (
              <Textarea
                id={field.key}
                rows={4}
                value={values[field.key] ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}
            {field.type === "SELECT" && (
              <Select
                items={Object.fromEntries(field.options.map((o) => [o, o]))}
                value={values[field.key] || null}
                onValueChange={(v) => setValue(field.key, v ?? "")}
              >
                <SelectTrigger id={field.key} className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.type === "CHECKBOX" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values[field.key] === "on"}
                  onCheckedChange={(checked) => setValue(field.key, checked ? "on" : "")}
                />
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </label>
            )}
            {field.type === "FILE" && (
              <input
                id={field.key}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFiles((prev) => ({ ...prev, [field.key]: e.target.files?.[0] }))}
                className="h-9 w-full rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-9 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
              />
            )}
          </div>
        ))}

        <Button onClick={handleSubmit} className="w-full" loading={isPending}>
          Submit
        </Button>
      </CardContent>
    </Card>
  );
}
