"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  updateInvoiceSettingsText,
  updateInvoiceLogo,
  removeInvoiceLogo,
} from "@/lib/actions/invoice-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InvoiceSettingsForm({
  hasLogo,
  ccEmails,
  footerText,
}: {
  hasLogo: boolean;
  ccEmails: string;
  footerText: string;
}) {
  const router = useRouter();
  const [logoPresent, setLogoPresent] = useState(hasLogo);
  // Bust both the <img> cache and the file input's own selected-file state
  // on every upload/remove — the img src URL never changes on its own
  // (same storage-key rules as everywhere else in the app), and remounting
  // the file input (via `key`) is the simplest way to clear its selection.
  const [logoVersion, setLogoVersion] = useState(0);
  const [isLogoPending, startLogoTransition] = useTransition();
  const [ccValue, setCcValue] = useState(ccEmails);
  const [footerValue, setFooterValue] = useState(footerText);
  const [isTextPending, startTextTransition] = useTransition();

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("logo", file);
    startLogoTransition(async () => {
      try {
        await updateInvoiceLogo(formData);
        toast.success("Logo updated");
        setLogoPresent(true);
        setLogoVersion((v) => v + 1);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to upload logo");
        setLogoVersion((v) => v + 1);
      }
    });
  }

  function handleRemoveLogo() {
    startLogoTransition(async () => {
      try {
        await removeInvoiceLogo();
        toast.success("Logo removed");
        setLogoPresent(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove logo");
      }
    });
  }

  function handleSaveText() {
    startTextTransition(async () => {
      try {
        await updateInvoiceSettingsText({ ccEmails: ccValue, footerText: footerValue });
        toast.success("Saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logoPresent ? (
            <img
              key={logoVersion}
              src={`/api/invoice-settings/logo?v=${logoVersion}`}
              alt="Invoice logo"
              className="h-20 w-auto rounded border border-border bg-white object-contain p-1"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No logo set — invoices show the plain &quot;CTK&quot; wordmark.</p>
          )}
          <div className="flex items-center gap-2">
            <Input
              key={logoVersion}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoChange}
              disabled={isLogoPending}
              className="max-w-xs"
            />
            {logoPresent && (
              <Button variant="outline" size="sm" onClick={handleRemoveLogo} disabled={isLogoPending}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG or JPEG. Displayed up to 56pt tall in the top-left of the PDF.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email &amp; footer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ccEmails">CC on every invoice email</Label>
            <Input
              id="ccEmails"
              value={ccValue}
              onChange={(e) => setCcValue(e.target.value)}
              placeholder="bookkeeper@ctk.com, owner@ctk.com"
            />
            <p className="text-xs text-muted-foreground">Comma-separated. Leave blank for none.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="footerText">Invoice footer text</Label>
            <Textarea
              id="footerText"
              value={footerValue}
              onChange={(e) => setFooterValue(e.target.value)}
              placeholder="Printed at the bottom of every invoice PDF — e.g. payment terms, remit-to info."
              rows={4}
            />
          </div>
          <Button onClick={handleSaveText} disabled={isTextPending}>
            {isTextPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
