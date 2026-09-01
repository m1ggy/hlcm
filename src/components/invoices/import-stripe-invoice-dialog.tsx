"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudDownload, Loader2, Search, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { previewStripeInvoice, importStripeInvoice, findStripeInvoicesForClient } from "@/lib/actions/invoices";

const NONE = "__none__";

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };

type Preview = Awaited<ReturnType<typeof previewStripeInvoice>>;
type BrowseResult = Awaited<ReturnType<typeof findStripeInvoicesForClient>>[number];

// Pulls in an invoice a coworker created directly in the Stripe Dashboard
// instead of through this app — it never got a matching row here, so every
// Stripe webhook for it (paid, voided, ...) has been silently ignored (see
// src/app/api/webhooks/stripe/route.ts). Two steps: look it up read-only to
// confirm it's the right one, then pick which client it belongs to and
// commit. Accepts either a raw Stripe invoice id ("in_...") or a pasted
// hosted invoice URL — the id is pulled out of either.
export function ImportStripeInvoiceDialog({
  clients,
  applications,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [clientId, setClientId] = useState("");
  const [applicationId, setApplicationId] = useState(NONE);
  const [isLookingUp, startLookup] = useTransition();
  const [isImporting, startImport] = useTransition();

  // "Don't have the ID?" — browse a client's (or an email's) recent Stripe
  // invoices instead of pasting one in directly.
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseClientId, setBrowseClientId] = useState("");
  const [browseEmail, setBrowseEmail] = useState("");
  const [browseResults, setBrowseResults] = useState<BrowseResult[] | null>(null);
  const [isBrowsing, startBrowsing] = useTransition();

  function reset() {
    setRawInput("");
    setPreview(null);
    setClientId("");
    setApplicationId(NONE);
    setBrowseOpen(false);
    setBrowseClientId("");
    setBrowseEmail("");
    setBrowseResults(null);
  }

  function extractInvoiceId(value: string) {
    const match = value.match(/in_[a-zA-Z0-9]+/);
    return match ? match[0] : value.trim();
  }

  function lookupId(id: string) {
    startLookup(async () => {
      try {
        const result = await previewStripeInvoice(id);
        setPreview(result);
        setClientId(result.suggestedClientId ?? browseClientId ?? "");
        setRawInput(id);
      } catch (error) {
        setPreview(null);
        toast.error(error instanceof Error ? error.message : "Couldn't find that Stripe invoice");
      }
    });
  }

  function handleLookup() {
    const id = extractInvoiceId(rawInput);
    if (!id) {
      toast.error("Paste a Stripe invoice ID or hosted invoice link");
      return;
    }
    lookupId(id);
  }

  function handleBrowse() {
    if (!browseClientId && !browseEmail.trim()) {
      toast.error("Pick a client or enter an email to search by");
      return;
    }
    startBrowsing(async () => {
      try {
        const results = await findStripeInvoicesForClient({
          clientId: browseClientId || undefined,
          email: browseEmail || undefined,
        });
        setBrowseResults(results);
        if (results.length === 0) toast.error("No Stripe invoices found for that client/email");
      } catch (error) {
        setBrowseResults(null);
        toast.error(error instanceof Error ? error.message : "Search failed");
      }
    });
  }

  function handleImport() {
    if (!preview) return;
    if (!clientId) {
      toast.error("Pick which client this invoice belongs to");
      return;
    }
    startImport(async () => {
      try {
        const invoice = await importStripeInvoice({
          stripeInvoiceId: preview.stripeInvoiceId,
          clientId,
          applicationId: applicationId === NONE ? undefined : applicationId,
        });
        toast.success("Invoice imported");
        setOpen(false);
        reset();
        router.push(`/invoices/${invoice.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to import invoice");
      }
    });
  }

  const clientApplications = applications.filter((a) => a.clientId === clientId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline"><CloudDownload className="size-3.5" /> Import from Stripe</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a Stripe invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For an invoice created directly in the Stripe Dashboard instead of here — it has no record in this app
            yet, so payment/void updates from Stripe have been silently ignored for it until now.
          </p>

          <div className="space-y-1">
            <Label htmlFor="stripeInvoiceId">Stripe invoice ID or hosted link</Label>
            <div className="flex gap-2">
              <Input
                id="stripeInvoiceId"
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  setPreview(null);
                }}
                placeholder="in_1AbCdE... or https://invoice.stripe.com/i/..."
              />
              <Button variant="outline" onClick={handleLookup} disabled={isLookingUp}>
                {isLookingUp ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                Look up
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setBrowseOpen((o) => !o)}
            >
              {browseOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Don&apos;t have the ID? Browse by client
            </button>

            {browseOpen && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Client</Label>
                    <SearchableSelect
                      items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                      value={browseClientId || null}
                      onValueChange={(v) => setBrowseClientId(v ?? "")}
                      placeholder="If already in the app"
                      searchPlaceholder="Search clients..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="browseEmail">Or billing email</Label>
                    <Input
                      id="browseEmail"
                      type="email"
                      value={browseEmail}
                      onChange={(e) => setBrowseEmail(e.target.value)}
                      placeholder="If not linked yet"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Uses the client&apos;s linked Stripe customer if it has one, otherwise an exact match on the email
                  typed above.
                </p>
                <Button variant="outline" size="sm" onClick={handleBrowse} disabled={isBrowsing}>
                  {isBrowsing ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                  Find invoices
                </Button>

                {browseResults && browseResults.length > 0 && (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {browseResults.map((inv) => (
                      <button
                        key={inv.stripeInvoiceId}
                        type="button"
                        disabled={inv.alreadyImported}
                        onClick={() => lookupId(inv.stripeInvoiceId)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>
                          <span className="font-medium">{inv.number ?? inv.stripeInvoiceId}</span>{" "}
                          <span className="text-muted-foreground">
                            {inv.customerName ?? inv.customerEmail} · {inv.createdAt.toLocaleDateString()}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {inv.alreadyImported ? "Already imported" : `${inv.status} · $${inv.total.toFixed(2)}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {preview && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Stripe customer</p>
                  <p>{preview.customerName ?? preview.customerEmail ?? preview.customerId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="capitalize">{preview.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p>${preview.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Line items</p>
                  <p>{preview.lineItemCount}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Belongs to which client?</Label>
                <SearchableSelect
                  items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                  value={clientId || null}
                  onValueChange={(v) => {
                    setClientId(v ?? "");
                    setApplicationId(NONE);
                  }}
                  placeholder="Select a client"
                  searchPlaceholder="Search clients..."
                />
                {preview.suggestedClientId && (
                  <p className="text-xs text-muted-foreground">
                    Matched by Stripe customer to {preview.suggestedClientName}.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Case (optional)</Label>
                <SearchableSelect
                  items={{ [NONE]: "None", ...Object.fromEntries(clientApplications.map((a) => [a.id, a.name])) }}
                  value={applicationId}
                  onValueChange={(v) => setApplicationId(v ?? NONE)}
                  searchPlaceholder="Search cases..."
                />
              </div>

              <Button onClick={handleImport} className="w-full" disabled={isImporting}>
                {isImporting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Import invoice
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
