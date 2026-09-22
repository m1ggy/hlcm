"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CareRecipientInvoiceForm } from "@/components/invoices/care-recipient-invoice-form";

type ProfileOption = { id: string; name: string };
type CaregiverOption = { id: string; name: string };

// A recipient's care recipient invoice, billed under the Client this
// recipient already belongs to — same createManualInvoice this Client's
// generic "New Manual Invoice" dialog (RecordPaymentDialog) uses, just
// without the client/case picker, since clientId/careRecipientId are
// already fixed by which recipient row this was opened from. The form
// itself (everything past picking who it's for) is shared with
// NewCareRecipientInvoiceDialog — see CareRecipientInvoiceForm.
export function CreateRecipientInvoiceDialog({
  clientId,
  careRecipientId,
  careRecipientName,
  hourlyRate,
  dailyRate,
  profiles,
  caregivers,
  isAdmin,
}: {
  clientId: string;
  careRecipientId: string;
  careRecipientName: string;
  hourlyRate: number | null;
  dailyRate: number | null;
  profiles: ProfileOption[];
  caregivers: CaregiverOption[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <HandCoins className="size-3.5" /> New invoice
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice — for {careRecipientName}</DialogTitle>
        </DialogHeader>
        <CareRecipientInvoiceForm
          key={careRecipientId}
          clientId={clientId}
          careRecipientId={careRecipientId}
          hourlyRate={hourlyRate}
          dailyRate={dailyRate}
          profiles={profiles}
          caregivers={caregivers}
          isAdmin={isAdmin}
          onCreated={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
