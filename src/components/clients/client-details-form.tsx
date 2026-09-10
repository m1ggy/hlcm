"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { updateClient } from "@/lib/actions/clients";
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES, type ClientStatus } from "@/lib/client-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ClientDetails = {
  name: string;
  contactInfo: string | null;
  address: string | null;
  businessName: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  status: ClientStatus;
  billingAddressLine1: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  clientGroupId: string | null;
};

// Sentinel for the Select's "no group" option — base-ui Select items need a
// real (non-empty) value; mapped back to "" (which updateClient reads as
// "ungroup this client") right before saving.
const NO_GROUP = "__none__";

type FieldKey = keyof ClientDetails;

function LabeledInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="h-8" />
    </div>
  );
}

export function ClientDetailsForm({
  clientId,
  defaultValues,
  groups,
}: {
  clientId: string;
  defaultValues: ClientDetails;
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [values, setValues] = useState({
    name: defaultValues.name,
    contactInfo: defaultValues.contactInfo ?? "",
    address: defaultValues.address ?? "",
    businessName: defaultValues.businessName ?? "",
    businessPhone: defaultValues.businessPhone ?? "",
    businessEmail: defaultValues.businessEmail ?? "",
    status: defaultValues.status,
    billingAddressLine1: defaultValues.billingAddressLine1 ?? "",
    billingCity: defaultValues.billingCity ?? "",
    billingState: defaultValues.billingState ?? "",
    billingPostalCode: defaultValues.billingPostalCode ?? "",
    billingCountry: defaultValues.billingCountry ?? "US",
    // "" means ungrouped — same empty-string-means-null convention
    // updateClient itself reads (see src/lib/actions/clients.ts).
    clientGroupId: defaultValues.clientGroupId ?? "",
  });

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function set(field: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [field]: v }));
  }

  function save(field: FieldKey, overrideValue?: string) {
    const next = { ...values, [field]: overrideValue ?? values[field as keyof typeof values] };
    if (next.name.trim().length === 0) {
      toast.error("Name can't be empty");
      setValues((prev) => ({ ...prev, name: defaultValues.name }));
      return;
    }
    const formData = new FormData();
    for (const [key, val] of Object.entries(next)) formData.set(key, val);
    startTransition(async () => {
      try {
        await updateClient(clientId, formData);
        router.refresh();
        // Brief "Saved ✓" confirmation next to the spinner — cleared on a
        // timer, and re-armed (clearing any previous timer) on every
        // successful save so back-to-back edits each get their own blip.
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        setJustSaved(true);
        savedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2000);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update client");
      }
    });
  }

  return (
    <div className="space-y-4">
      {isSaving ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Saving...
        </span>
      ) : (
        justSaved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" /> Saved
          </span>
        )
      )}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <LabeledInput id="name" label="Client name" value={values.name} onChange={(v) => set("name", v)} onBlur={() => save("name")} className="max-w-sm" />
          <div className="space-y-1">
            <Label htmlFor="clientGroupId" className="text-xs text-muted-foreground">
              Group
            </Label>
            <Select
              items={{ [NO_GROUP]: "No group", ...Object.fromEntries(groups.map((g) => [g.id, g.name])) }}
              value={values.clientGroupId || NO_GROUP}
              onValueChange={(v) => {
                const next = v === NO_GROUP || !v ? "" : v;
                set("clientGroupId", next);
                save("clientGroupId", next);
              }}
            >
              <SelectTrigger id="clientGroupId" size="sm" className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              items={CLIENT_STATUS_LABELS}
              value={values.status}
              onValueChange={(v) => {
                const next = (v as ClientStatus) || values.status;
                set("status", next);
                save("status", next);
              }}
            >
              <SelectTrigger id="status" size="sm" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CLIENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <LabeledInput id="businessName" label="Legal business name" value={values.businessName} onChange={(v) => set("businessName", v)} onBlur={() => save("businessName")} />
          <LabeledInput id="address" label="Address" value={values.address} onChange={(v) => set("address", v)} onBlur={() => save("address")} />
          <LabeledInput id="businessPhone" label="Business phone" value={values.businessPhone} onChange={(v) => set("businessPhone", v)} onBlur={() => save("businessPhone")} type="tel" />
          <LabeledInput id="businessEmail" label="Business email" value={values.businessEmail} onChange={(v) => set("businessEmail", v)} onBlur={() => save("businessEmail")} type="email" />
          <LabeledInput id="contactInfo" label="Other contact info" value={values.contactInfo} onChange={(v) => set("contactInfo", v)} onBlur={() => save("contactInfo")} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing address</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Needed to send this client an invoice — Stripe Tax uses the state and ZIP to calculate sales tax.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput
              id="billingAddressLine1"
              label="Street address"
              value={values.billingAddressLine1}
              onChange={(v) => set("billingAddressLine1", v)}
              onBlur={() => save("billingAddressLine1")}
              className="sm:col-span-2"
            />
            <LabeledInput id="billingCity" label="City" value={values.billingCity} onChange={(v) => set("billingCity", v)} onBlur={() => save("billingCity")} />
            <LabeledInput id="billingState" label="State" value={values.billingState} onChange={(v) => set("billingState", v)} onBlur={() => save("billingState")} />
            <LabeledInput id="billingPostalCode" label="ZIP code" value={values.billingPostalCode} onChange={(v) => set("billingPostalCode", v)} onBlur={() => save("billingPostalCode")} />
            <LabeledInput id="billingCountry" label="Country" value={values.billingCountry} onChange={(v) => set("billingCountry", v)} onBlur={() => save("billingCountry")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
