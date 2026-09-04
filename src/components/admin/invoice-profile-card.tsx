"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Star } from "lucide-react";
import {
  updateInvoiceProfileText,
  updateInvoiceProfileLogo,
  removeInvoiceProfileLogo,
  setDefaultInvoiceProfile,
  deleteInvoiceProfile,
} from "@/lib/actions/invoice-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoCropDialog } from "./logo-crop-dialog";

export type InvoiceProfileSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  hasLogo: boolean;
  ccEmails: string;
  footerText: string;
};

export function InvoiceProfileCard({
  profile,
  canDelete,
}: {
  profile: InvoiceProfileSummary;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [logoPresent, setLogoPresent] = useState(profile.hasLogo);
  // Bust both the <img> cache and the file input's own selected-file state
  // on every upload/remove — the img src URL never changes on its own,
  // and remounting the file input (via `key`) is the simplest way to
  // clear its selection.
  const [logoVersion, setLogoVersion] = useState(0);
  const [isLogoPending, startLogoTransition] = useTransition();
  const [nameValue, setNameValue] = useState(profile.name);
  const [ccValue, setCcValue] = useState(profile.ccEmails);
  const [footerValue, setFooterValue] = useState(profile.footerText);
  const [isTextPending, startTextTransition] = useTransition();
  const [isActionPending, startActionTransition] = useTransition();
  // Set the moment a file is picked, cleared once cropping is confirmed or
  // cancelled — its presence alone drives whether LogoCropDialog is open.
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickedFile(file);
  }

  function uploadLogo(file: File) {
    const formData = new FormData();
    formData.set("logo", file);
    startLogoTransition(async () => {
      try {
        await updateInvoiceProfileLogo(profile.id, formData);
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

  function handleCropConfirm(cropped: File) {
    setPickedFile(null);
    uploadLogo(cropped);
  }

  function handleCropCancel() {
    setPickedFile(null);
    // The file input's own selection needs clearing too — otherwise
    // re-picking the exact same file wouldn't fire a change event.
    setLogoVersion((v) => v + 1);
  }

  function handleRemoveLogo() {
    startLogoTransition(async () => {
      try {
        await removeInvoiceProfileLogo(profile.id);
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
        await updateInvoiceProfileText(profile.id, { name: nameValue, ccEmails: ccValue, footerText: footerValue });
        toast.success("Saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save");
      }
    });
  }

  function handleSetDefault() {
    startActionTransition(async () => {
      try {
        await setDefaultInvoiceProfile(profile.id);
        toast.success(`${nameValue} is now the default`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to set default");
      }
    });
  }

  function handleDelete() {
    startActionTransition(async () => {
      try {
        await deleteInvoiceProfile(profile.id);
        toast.success("Profile deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete profile");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-base">
          {profile.name}
          {profile.isDefault && (
            <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
              <Star className="size-3" /> Default
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {!profile.isDefault && (
            <Button variant="ghost" size="sm" onClick={handleSetDefault} disabled={isActionPending}>
              Set as default
            </Button>
          )}
          {canDelete && !profile.isDefault && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isActionPending}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor={`name-${profile.id}`}>Name</Label>
          <Input id={`name-${profile.id}`} value={nameValue} onChange={(e) => setNameValue(e.target.value)} />
        </div>

        <div className="space-y-3">
          <Label>Logo</Label>
          {logoPresent ? (
            <img
              key={logoVersion}
              src={`/api/invoice-profiles/${profile.id}/logo?v=${logoVersion}`}
              alt={`${profile.name} logo`}
              className="h-20 w-auto rounded border border-border bg-white object-contain p-1"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No logo set — invoices show the plain name as text.</p>
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
          <LogoCropDialog file={pickedFile} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`cc-${profile.id}`}>CC on every invoice email</Label>
          <Input
            id={`cc-${profile.id}`}
            value={ccValue}
            onChange={(e) => setCcValue(e.target.value)}
            placeholder="bookkeeper@ctk.com, owner@ctk.com"
          />
          <p className="text-xs text-muted-foreground">Comma-separated. Leave blank for none.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`footer-${profile.id}`}>Invoice footer text</Label>
          <Textarea
            id={`footer-${profile.id}`}
            value={footerValue}
            onChange={(e) => setFooterValue(e.target.value)}
            placeholder="Printed at the bottom of every invoice PDF using this profile — e.g. payment terms, remit-to info."
            rows={4}
          />
        </div>

        <Button onClick={handleSaveText} disabled={isTextPending}>
          {isTextPending ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
