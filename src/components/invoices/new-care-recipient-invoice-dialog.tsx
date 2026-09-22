"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CareRecipientInvoiceForm } from "@/components/invoices/care-recipient-invoice-form";

type RecipientOption = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  hourlyRate: number | null;
  dailyRate: number | null;
};
type ProfileOption = { id: string; name: string };
type CaregiverOption = { id: string; name: string };

// The Invoices page's own entry point into billing a Care Recipient —
// same CareRecipientInvoiceForm the Client page's CreateRecipientInvoiceDialog
// uses, just with a recipient picker in front of it instead of a fixed
// clientId/careRecipientId, since this is opened from NewInvoiceMenu with no
// client/recipient already in context. Always controlled — see NewInvoiceMenu.
export function NewCareRecipientInvoiceDialog({
  open,
  onOpenChange,
  recipients,
  profiles,
  caregivers,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: RecipientOption[];
  profiles: ProfileOption[];
  caregivers: CaregiverOption[];
  isAdmin: boolean;
}) {
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const recipient = recipients.find((r) => r.id === recipientId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setRecipientId(null);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{recipient ? `New invoice — for ${recipient.name}` : "New Care Recipient invoice"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Care recipient</Label>
            <SearchableSelect
              items={Object.fromEntries(recipients.map((r) => [r.id, `${r.name} — ${r.clientName}`]))}
              value={recipientId}
              onValueChange={setRecipientId}
              searchPlaceholder="Search recipients..."
            />
          </div>

          {recipient && (
            <CareRecipientInvoiceForm
              key={recipient.id}
              clientId={recipient.clientId}
              careRecipientId={recipient.id}
              hourlyRate={recipient.hourlyRate}
              dailyRate={recipient.dailyRate}
              profiles={profiles}
              caregivers={caregivers}
              isAdmin={isAdmin}
              onCreated={() => {
                onOpenChange(false);
                setRecipientId(null);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
