"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { getPayoutFields, saveMyWiseRecipient } from "@/lib/actions/wise";
import type { WiseRequirementField } from "@/lib/wise";

const CURRENCIES = [
  { code: "USD", label: "USD — United States" },
  { code: "PHP", label: "PHP — Philippines" },
  { code: "PKR", label: "PKR — Pakistan" },
  { code: "INR", label: "INR — India" },
];

export function PayoutDetailsForm({
  saved,
}: {
  saved: { currency: string; accountHolderName: string; updatedAt: Date } | null;
}) {
  const [currency, setCurrency] = useState(saved?.currency ?? "USD");
  const [accountHolderName, setAccountHolderName] = useState(saved?.accountHolderName ?? "");
  const [type, setType] = useState<string | null>(null);
  const [fields, setFields] = useState<WiseRequirementField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isLoadingFields, startLoadingFields] = useTransition();
  const [isSaving, startSaving] = useTransition();

  function loadFields(nextCurrency: string) {
    setCurrency(nextCurrency);
    setFields([]);
    setValues({});
    startLoadingFields(async () => {
      try {
        const result = await getPayoutFields(nextCurrency);
        setType(result.type);
        setFields(result.fields);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load requirements");
      }
    });
  }

  function handleSave() {
    if (!type) {
      toast.error("Pick a currency first");
      return;
    }
    if (!accountHolderName.trim()) {
      toast.error("Account holder name is required");
      return;
    }
    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Missing: ${missing.map((f) => f.name).join(", ")}`);
      return;
    }
    startSaving(async () => {
      try {
        await saveMyWiseRecipient({ currency, type, accountHolderName, fields: values });
        toast.success("Payout details saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save payout details");
      }
    });
  }

  return (
    <div className="space-y-4">
      {saved && (
        <p className="text-sm text-muted-foreground">
          Currently on file: <span className="text-foreground">{saved.accountHolderName}</span> ·{" "}
          {saved.currency} · saved {saved.updatedAt.toLocaleDateString()}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Payout currency</Label>
          <Select value={currency} onValueChange={(v) => v && loadFields(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => CURRENCIES.find((c) => c.code === v)?.label ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="accountHolderName">Account holder name</Label>
          <Input
            id="accountHolderName"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
          />
        </div>
      </div>

      {isLoadingFields && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading what {currency} needs…
        </p>
      )}

      {!isLoadingFields && fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={field.key}>
                {field.name}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id={field.key}
                placeholder={field.example}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      <Button onClick={handleSave} disabled={isSaving || !type}>
        {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Save payout details
      </Button>
    </div>
  );
}
