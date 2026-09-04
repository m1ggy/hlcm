"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/actions/clients";
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

// Same field set as ClientDetailsForm (the edit page) — filled in here
// up front instead of piecemeal after the fact. Everything but name and
// business email is optional at creation time (staff can finish the
// rest later from the client's page) — business email is required
// because invoice sending needs it and it's otherwise easy to discover
// missing only once someone tries to send an invoice (see sendInvoice /
// sendManualInvoicePdf in src/lib/actions/invoices.ts).
function Field({
  id,
  label,
  type = "text",
  defaultValue,
  className,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input id={id} name={id} type={type} defaultValue={defaultValue} required={required} className="h-8" />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

// projectId is fixed when this is opened from inside a Project's own page
// (the common case — the new client is obviously for that project). Pass
// `projects` instead from a context with no such project already in
// scope (e.g. the global Clients list) to show a picker; exactly one of
// the two should be given.
export function NewClientDialog({
  projectId,
  projects,
}: {
  projectId?: string;
  projects?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    const resolvedProjectId = projectId ?? pickedProjectId;
    if (!resolvedProjectId) {
      toast.error("Pick a project");
      return;
    }
    formData.set("projectId", resolvedProjectId);
    startTransition(async () => {
      try {
        await createClient(formData);
        toast.success("Client created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create client");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button>New Client</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs text-muted-foreground">
              Client name
            </Label>
            <Input id="name" name="name" required className="h-8" />
          </div>

          {projects && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Project
                <span className="text-destructive"> *</span>
              </Label>
              <SearchableSelect
                items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
                value={pickedProjectId}
                onValueChange={setPickedProjectId}
                placeholder="Select a project..."
                searchPlaceholder="Search projects..."
                className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <SectionHeading>Business details</SectionHeading>
              <Field id="businessName" label="Legal business name" />
              <Field id="address" label="Address" />
              <Field id="businessPhone" label="Business phone" type="tel" />
              <Field id="businessEmail" label="Business email" type="email" required />
              <Field id="contactInfo" label="Other contact info" />
            </div>

            <div className="space-y-3">
              <SectionHeading>Owner details</SectionHeading>
              <Field id="ownerName" label="Owner name" />
              <Field id="ownerEmail" label="Owner email" type="email" />
              <Field id="ownerPhone" label="Owner phone" type="tel" />
              <Field id="ownerDateOfBirth" label="Owner date of birth" type="date" />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <SectionHeading>Billing address</SectionHeading>
              <p className="mt-1 text-xs text-muted-foreground">
                Needed to invoice this client — Stripe Tax uses the state and ZIP to calculate sales tax.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="billingAddressLine1" label="Street address" className="sm:col-span-2" />
              <Field id="billingCity" label="City" />
              <Field id="billingState" label="State" />
              <Field id="billingPostalCode" label="ZIP code" />
              <Field id="billingCountry" label="Country" defaultValue="US" />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
