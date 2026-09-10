"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/actions/clients";
import { linkSubmissionToClient } from "@/lib/actions/form-submissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  );
}

// `defaults` come from whichever of the submission's answers had a
// clientField mapping set on the form (see FormTemplateDialog) — anything
// unmapped simply isn't here, and staff can still fill/fix any field
// before actually creating the client, same as the plain New Client flow.
export function CreateClientFromSubmissionDialog({
  submissionId,
  defaults,
  projects,
}: {
  submissionId: string;
  defaults: Record<string, string>;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [values, setValues] = useState({
    name: defaults.name ?? "",
    businessName: defaults.businessName ?? "",
    businessEmail: defaults.businessEmail ?? "",
    businessPhone: defaults.businessPhone ?? "",
    contactInfo: defaults.contactInfo ?? "",
    address: defaults.address ?? "",
  });

  function set(key: keyof typeof values, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function handleSubmit() {
    if (!values.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!values.businessEmail.trim()) {
      toast.error("Business email is required");
      return;
    }
    if (!projectId) {
      toast.error("Pick a project");
      return;
    }

    const formData = new FormData();
    formData.set("projectId", projectId);
    for (const [key, value] of Object.entries(values)) {
      if (value) formData.set(key, value);
    }

    startTransition(async () => {
      try {
        const client = await createClient(formData);
        await linkSubmissionToClient(submissionId, client.id);
        toast.success(`${client.name} created`);
        setOpen(false);
        router.refresh();
        router.push(`/clients/${client.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create client");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><UserPlus className="size-3.5" /> Create client from this</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create client from submission</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Pre-filled from whatever the submission mapped to a client field — review before creating.
          </p>
          <div className="space-y-1">
            <Label>Project</Label>
            <SearchableSelect
              items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
              value={projectId || null}
              onValueChange={(v) => setProjectId(v ?? projectId)}
              searchPlaceholder="Search projects..."
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="csf-name" label="Client name" value={values.name} onChange={(v) => set("name", v)} required />
            <Field id="csf-businessName" label="Business name" value={values.businessName} onChange={(v) => set("businessName", v)} />
            <Field
              id="csf-businessEmail"
              label="Business email"
              type="email"
              value={values.businessEmail}
              onChange={(v) => set("businessEmail", v)}
              required
            />
            <Field id="csf-businessPhone" label="Business phone" value={values.businessPhone} onChange={(v) => set("businessPhone", v)} />
            <Field id="csf-contactInfo" label="Other contact info" value={values.contactInfo} onChange={(v) => set("contactInfo", v)} />
          </div>
          <Field id="csf-address" label="Address" value={values.address} onChange={(v) => set("address", v)} />
          <Button onClick={handleSubmit} className="w-full" loading={isPending}>
            Create client
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
