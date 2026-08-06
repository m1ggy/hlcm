"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClient } from "@/lib/actions/clients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClientDetails = {
  name: string;
  contactInfo: string | null;
  address: string | null;
  businessName: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerDateOfBirth: Date | null;
};

type FieldKey = keyof ClientDetails;

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

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

export function ClientDetailsForm({ clientId, defaultValues }: { clientId: string; defaultValues: ClientDetails }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState({
    name: defaultValues.name,
    contactInfo: defaultValues.contactInfo ?? "",
    address: defaultValues.address ?? "",
    businessName: defaultValues.businessName ?? "",
    businessPhone: defaultValues.businessPhone ?? "",
    businessEmail: defaultValues.businessEmail ?? "",
    ownerName: defaultValues.ownerName ?? "",
    ownerEmail: defaultValues.ownerEmail ?? "",
    ownerPhone: defaultValues.ownerPhone ?? "",
    ownerDateOfBirth: toDateInputValue(defaultValues.ownerDateOfBirth),
  });

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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update client");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <LabeledInput id="name" label="Client name" value={values.name} onChange={(v) => set("name", v)} onBlur={() => save("name")} className="max-w-sm" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LabeledInput id="businessName" label="Legal business name" value={values.businessName} onChange={(v) => set("businessName", v)} onBlur={() => save("businessName")} />
            <LabeledInput id="address" label="Address" value={values.address} onChange={(v) => set("address", v)} onBlur={() => save("address")} />
            <LabeledInput id="businessPhone" label="Business phone" value={values.businessPhone} onChange={(v) => set("businessPhone", v)} onBlur={() => save("businessPhone")} type="tel" />
            <LabeledInput id="businessEmail" label="Business email" value={values.businessEmail} onChange={(v) => set("businessEmail", v)} onBlur={() => save("businessEmail")} type="email" />
            <LabeledInput id="contactInfo" label="Other contact info" value={values.contactInfo} onChange={(v) => set("contactInfo", v)} onBlur={() => save("contactInfo")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LabeledInput id="ownerName" label="Owner name" value={values.ownerName} onChange={(v) => set("ownerName", v)} onBlur={() => save("ownerName")} />
            <LabeledInput id="ownerEmail" label="Owner email" value={values.ownerEmail} onChange={(v) => set("ownerEmail", v)} onBlur={() => save("ownerEmail")} type="email" />
            <LabeledInput id="ownerPhone" label="Owner phone" value={values.ownerPhone} onChange={(v) => set("ownerPhone", v)} onBlur={() => save("ownerPhone")} type="tel" />
            <LabeledInput
              id="ownerDateOfBirth"
              label="Owner date of birth"
              value={values.ownerDateOfBirth}
              onChange={(v) => {
                set("ownerDateOfBirth", v);
                save("ownerDateOfBirth", v);
              }}
              onBlur={() => {}}
              type="date"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
