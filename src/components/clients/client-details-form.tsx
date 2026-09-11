"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, TriangleAlert } from "lucide-react";
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
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  className?: string;
  error?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="h-8"
        aria-invalid={!!error}
      />
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <TriangleAlert className="size-3 shrink-0" /> Didn&apos;t save — {error}
        </p>
      )}
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
  // Distinct from the ephemeral toast: a toast can be missed (dismissed,
  // scrolled past, or the tab wasn't focused), and the field it was about
  // kept showing whatever was typed either way — so a failed save looked
  // identical to a successful one until the next reload silently dropped
  // it. This stays up until the field saves successfully or the user
  // edits it again.
  const [saveError, setSaveError] = useState<{ field: FieldKey; message: string } | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialValues = {
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
  };
  const [values, setValues] = useState(initialValues);
  // The last state the SERVER actually confirmed — distinct from
  // `defaultValues` (only ever the page's initial load) and from `values`
  // (whatever's currently typed, saved or not). A failed save reverts the
  // field to this, not to `defaultValues`, so an earlier successful edit
  // to the same field this session doesn't get clobbered by a later
  // failure reverting too far back.
  const lastSavedRef = useRef(initialValues);
  // Each save() call gets a ticket; a response only applies if it's still
  // the newest one in flight for its field. Without this, two overlapping
  // saves (fast typing across fields, or a slow network) can resolve out
  // of order — an older, slower request landing after a newer one would
  // silently overwrite it with a stale snapshot.
  const saveTicketRef = useRef<Partial<Record<FieldKey, number>>>({});
  const nextTicketRef = useRef(0);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function set(field: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [field]: v }));
    setSaveError((prev) => (prev?.field === field ? null : prev));
  }

  function save(field: FieldKey, overrideValue?: string) {
    const next = { ...values, [field]: overrideValue ?? values[field as keyof typeof values] };
    if (next.name.trim().length === 0) {
      toast.error("Name can't be empty");
      setValues((prev) => ({ ...prev, name: lastSavedRef.current.name }));
      return;
    }
    const ticket = ++nextTicketRef.current;
    saveTicketRef.current[field] = ticket;
    const formData = new FormData();
    for (const [key, val] of Object.entries(next)) formData.set(key, val);
    startTransition(async () => {
      try {
        await updateClient(clientId, formData);
        if (saveTicketRef.current[field] !== ticket) return; // superseded by a newer save on this field
        lastSavedRef.current = next;
        router.refresh();
        setSaveError((prev) => (prev?.field === field ? null : prev));
        // Brief "Saved ✓" confirmation next to the spinner — cleared on a
        // timer, and re-armed (clearing any previous timer) on every
        // successful save so back-to-back edits each get their own blip.
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        setJustSaved(true);
        savedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2000);
      } catch (error) {
        if (saveTicketRef.current[field] !== ticket) return; // a newer save is already handling this field
        const message = error instanceof Error ? error.message : "Failed to update client";
        toast.error(message);
        setSaveError({ field, message });
        // Revert to what the server actually has, so the field never sits
        // there looking "filled" when it isn't — the exact failure mode
        // that silently lost data before (typed, appeared saved, gone on
        // reload).
        setValues((prev) => ({ ...prev, [field]: lastSavedRef.current[field as keyof typeof prev] }));
      }
    });
  }

  function errorFor(field: FieldKey) {
    return saveError?.field === field ? saveError.message : undefined;
  }

  return (
    <div className="space-y-4">
      {isSaving ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Saving...
        </span>
      ) : justSaved ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="size-3" /> Saved
        </span>
      ) : (
        saveError && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <TriangleAlert className="size-3" /> Didn&apos;t save — {saveError.message}
          </span>
        )
      )}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <LabeledInput id="name" label="Client name" value={values.name} onChange={(v) => set("name", v)} onBlur={() => save("name")} className="max-w-sm" error={errorFor("name")} />
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
          <LabeledInput id="businessName" label="Legal business name" value={values.businessName} onChange={(v) => set("businessName", v)} onBlur={() => save("businessName")} error={errorFor("businessName")} />
          <LabeledInput id="address" label="Address" value={values.address} onChange={(v) => set("address", v)} onBlur={() => save("address")} error={errorFor("address")} />
          <LabeledInput id="businessPhone" label="Business phone" value={values.businessPhone} onChange={(v) => set("businessPhone", v)} onBlur={() => save("businessPhone")} type="tel" error={errorFor("businessPhone")} />
          <LabeledInput id="businessEmail" label="Business email" value={values.businessEmail} onChange={(v) => set("businessEmail", v)} onBlur={() => save("businessEmail")} type="email" error={errorFor("businessEmail")} />
          <LabeledInput id="contactInfo" label="Other contact info" value={values.contactInfo} onChange={(v) => set("contactInfo", v)} onBlur={() => save("contactInfo")} className="sm:col-span-2" error={errorFor("contactInfo")} />
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
              error={errorFor("billingAddressLine1")}
            />
            <LabeledInput id="billingCity" label="City" value={values.billingCity} onChange={(v) => set("billingCity", v)} onBlur={() => save("billingCity")} error={errorFor("billingCity")} />
            <LabeledInput id="billingState" label="State" value={values.billingState} onChange={(v) => set("billingState", v)} onBlur={() => save("billingState")} error={errorFor("billingState")} />
            <LabeledInput id="billingPostalCode" label="ZIP code" value={values.billingPostalCode} onChange={(v) => set("billingPostalCode", v)} onBlur={() => save("billingPostalCode")} error={errorFor("billingPostalCode")} />
            <LabeledInput id="billingCountry" label="Country" value={values.billingCountry} onChange={(v) => set("billingCountry", v)} onBlur={() => save("billingCountry")} error={errorFor("billingCountry")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
