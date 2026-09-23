"use client";

import { useState } from "react";
import { ChevronDown, Globe, FileText, HeartHandshake, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { NewCareRecipientInvoiceDialog } from "@/components/invoices/new-care-recipient-invoice-dialog";
import { BatchCareRecipientInvoiceDialog } from "@/components/invoices/batch-care-recipient-invoice-dialog";

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };
type ProfileOption = { id: string; name: string };
type CaregiverOption = { id: string; name: string };
type RecipientOption = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  hourlyRate: number | null;
  dailyRate: number | null;
  outstandingBalance: number;
};

type InvoiceType = "online" | "manual" | "recipient" | "batch" | null;

// One "New invoice" entry point for all three ways to bill — previously
// three separate always-visible buttons (plus Care Recipient billing not
// reachable from here at all, only buried on the Client page's recipient
// row). Each dialog below is the same component used elsewhere, just
// driven by `activeType` instead of rendering its own trigger — see the
// `open`/`onOpenChange` props on InvoiceFormDialog/RecordPaymentDialog.
export function NewInvoiceMenu({
  clients,
  applications,
  profiles,
  recipients,
  caregivers,
  isAdmin,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
  profiles: ProfileOption[];
  recipients: RecipientOption[];
  caregivers: CaregiverOption[];
  isAdmin: boolean;
}) {
  const [activeType, setActiveType] = useState<InvoiceType>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button data-tour="new-invoice">
              New invoice <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setActiveType("online")}>
            <Globe className="size-3.5" /> Online (Stripe)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveType("manual")}>
            <FileText className="size-3.5" /> Manual
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveType("recipient")}>
            <HeartHandshake className="size-3.5" /> Care Recipient
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveType("batch")}>
            <Users className="size-3.5" /> Batch by client
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InvoiceFormDialog
        clients={clients}
        applications={applications}
        open={activeType === "online"}
        onOpenChange={(next) => setActiveType(next ? "online" : null)}
      />
      <RecordPaymentDialog
        clients={clients}
        applications={applications}
        profiles={profiles}
        open={activeType === "manual"}
        onOpenChange={(next) => setActiveType(next ? "manual" : null)}
      />
      <NewCareRecipientInvoiceDialog
        recipients={recipients}
        profiles={profiles}
        caregivers={caregivers}
        isAdmin={isAdmin}
        open={activeType === "recipient"}
        onOpenChange={(next) => setActiveType(next ? "recipient" : null)}
      />
      <BatchCareRecipientInvoiceDialog
        clients={clients}
        profiles={profiles}
        open={activeType === "batch"}
        onOpenChange={(next) => setActiveType(next ? "batch" : null)}
      />
    </>
  );
}
