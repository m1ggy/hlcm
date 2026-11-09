"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, RefreshCw, Share2 } from "lucide-react";
import { createShareLinkAction, getShareStateAction, revokeShareLinkAction, setShareExpiryAction } from "@/lib/actions/share-links";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Share an application's progress page (docs/client-portal-eod-plan.md,
// Phase D). The link is shown once, right after it's made — only a hash is
// kept — so "copy it again" means making a new one.

type Link = { id: string; createdAt: Date; expiresAt: Date | null; lastViewedAt: Date | null; viewCount: number; createdBy: { name: string } };
type Recipient = { name: string; email: string };

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTime = (d: Date | string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ShareLinkDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ link: Link | null; recipients: Recipient[] } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [emailTo, setEmailTo] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let live = true;
    getShareStateAction(applicationId).then(
      (r) => {
        if (!live) return;
        if (!r.ok) {
          toast.error(r.error);
          setOpen(false);
          return;
        }
        setState(r.data);
        setExpiresOn(r.data.link?.expiresAt ? new Date(r.data.link.expiresAt).toISOString().slice(0, 10) : "");
      },
      () => live && toast.error("Couldn't load sharing")
    );
    return () => {
      live = false;
    };
  }, [open, applicationId]);

  const expired = Boolean(state?.link?.expiresAt && new Date(state.link.expiresAt) <= new Date());

  function make() {
    start(async () => {
      try {
        const r = await createShareLinkAction(applicationId, { expiresOn: expiresOn || null, emailTo });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setUrl(r.data.url);
        setCopied(false);
        setState((s) => (s ? { ...s, link: r.data.link } : s));
        setEmailTo([]);
        toast.success(r.data.emailed ? `Link made and emailed to ${r.data.emailed} ${r.data.emailed === 1 ? "person" : "people"}` : "Link made");
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't make the link"));
      }
    });
  }

  function saveExpiry() {
    start(async () => {
      const r = await setShareExpiryAction(applicationId, expiresOn || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setState((s) => (s ? { ...s, link: r.data } : s));
      toast.success("Expiry saved");
    });
  }

  function revoke() {
    if (!window.confirm("Turn the link off? Anyone who has it will see “This link is no longer active.”")) return;
    start(async () => {
      const r = await revokeShareLinkAction(applicationId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setUrl(null);
      setState((s) => (s ? { ...s, link: null } : s));
      toast.success("Link turned off");
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select the link and copy it");
    }
  }

  const link = state?.link ?? null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setUrl(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 className="size-4" /> Share
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share progress with the client</DialogTitle>
          <DialogDescription>
            A read-only page anyone with the link can open — no account. It shows the stage, the checklist, and the work and correspondence you&apos;ve marked
            &ldquo;Share with the client&rdquo;. Never files, notes or hours.
          </DialogDescription>
        </DialogHeader>

        {!state ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {url && (
              <div className="space-y-1 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <Label htmlFor="share-url">Your link</Label>
                <div className="flex gap-2">
                  <Input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={copy} aria-label="Copy link">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Copy it now — for safety it isn&apos;t shown again. You can always make a new one.</p>
              </div>
            )}

            {link ? (
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Link2 className="size-4" /> {expired ? "Link expired" : "Link is on"}
                </p>
                <p className="text-muted-foreground">
                  Made {shortDate(link.createdAt)} by {link.createdBy.name}
                  {link.expiresAt ? ` · ${expired ? "expired" : "expires"} ${shortDate(link.expiresAt)}` : " · no expiry"}
                </p>
                <p className="text-muted-foreground">
                  {link.viewCount ? `Opened ${link.viewCount} ${link.viewCount === 1 ? "time" : "times"}, last ${dateTime(link.lastViewedAt!)}` : "Not opened yet"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No link yet.</p>
            )}

            <div className="space-y-1">
              <Label htmlFor="share-expiry">Expires (optional)</Label>
              <div className="flex gap-2">
                <Input id="share-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="w-44" />
                {link && (
                  <Button type="button" variant="outline" onClick={saveExpiry} disabled={pending}>
                    Save expiry
                  </Button>
                )}
              </div>
            </div>

            {state.recipients.length > 0 ? (
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Email the new link to</legend>
                {state.recipients.map((r) => (
                  <label key={r.email} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={emailTo.includes(r.email)}
                      onCheckedChange={(c) => setEmailTo((cur) => (c ? [...cur, r.email] : cur.filter((e) => e !== r.email)))}
                    />
                    {r.name} <span className="text-muted-foreground">{r.email}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="text-xs text-muted-foreground">Add an email to the client&apos;s contacts to send the link from here.</p>
            )}

            <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
              {link ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={revoke} disabled={pending}>
                  Turn link off
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" onClick={make} loading={pending}>
                {link ? <RefreshCw className="size-4" /> : <Link2 className="size-4" />}
                {link ? "Make a new link" : "Make link"}
                {emailTo.length ? " and email it" : ""}
              </Button>
            </div>
            {link && <p className="text-xs text-muted-foreground">Making a new link turns the old one off.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
