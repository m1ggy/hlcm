"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrganizationFromPlatform,
  resendOwnerInvitesFromPlatform,
  setOrganizationStatusFromPlatform,
} from "@/lib/actions/platform";
import type { PlatformOrganization } from "@/lib/platform";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Org = PlatformOrganization & { url: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function useAction() {
  const router = useRouter();
  const [isPending, start] = useTransition();
  function run<T>(action: () => Promise<Result<T>>, onOk: (data: T) => void) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onOk(result.data);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong. Please try again."));
      }
    });
  }
  return { isPending, run };
}

// Suggests the address from the name ("Sunrise Home Care" -> "sunrise-home-care") until edited.
function slugify(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

const EMPTY_FORM = { name: "", slug: "", ownerName: "", ownerEmail: "" };

function NewOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const { isPending, run } = useAction();

  function set(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value, ...(key === "name" && !slugEdited ? { slug: slugify(value) } : {}) }));
  }

  function handleCreate() {
    run(() => createOrganizationFromPlatform(form), ({ slug, inviteSent }) => {
      if (inviteSent) toast.success(`Created ${slug} and invited its owner`);
      else toast.warning(`Created ${slug}, but the owner invite couldn't be sent — use "Resend owner invite".`);
      setOpen(false);
      setForm(EMPTY_FORM);
      setSlugEdited(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New organization</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-slug">Address</Label>
            <Input
              id="org-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", e.target.value.toLowerCase());
              }}
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">The workspace&apos;s subdomain. Can&apos;t be changed later.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="owner-name">Owner name</Label>
            <Input id="owner-name" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="owner-email">Owner email</Label>
            <Input id="owner-email" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            Create and invite owner
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationRow({ org }: { org: Org }) {
  const { isPending, run } = useAction();
  const suspended = org.status === "SUSPENDED";

  function toggleStatus() {
    const next = suspended ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !confirm(`Suspend ${org.name}? Nobody can sign in to ${org.slug} until it's reactivated.`)) return;
    run(
      () => setOrganizationStatusFromPlatform(org.id, next),
      () => toast.success(`${org.name} ${next === "SUSPENDED" ? "suspended" : "reactivated"}`)
    );
  }

  function resendInvite() {
    run(
      () => resendOwnerInvitesFromPlatform(org.id),
      (n) => toast.success(n ? `Re-sent ${n} owner invite${n === 1 ? "" : "s"}` : "Every owner has already accepted their invite")
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{org.name}</TableCell>
      <TableCell>
        <a href={org.url} className="font-mono text-xs underline" target="_blank" rel="noreferrer">
          {org.slug}
        </a>
      </TableCell>
      <TableCell>{suspended ? <Badge variant="outline">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
      <TableCell className="text-muted-foreground">{org.userCount}</TableCell>
      <TableCell className="text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</TableCell>
      <TableCell className="space-x-1 text-right">
        <Button variant="ghost" size="sm" disabled={isPending || suspended} onClick={resendInvite}>
          Resend owner invite
        </Button>
        <Button variant="ghost" size="sm" loading={isPending} onClick={toggleStatus}>
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function PlatformOrganizations({ organizations }: { organizations: Org[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewOrganizationDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => (
            <OrganizationRow key={org.id} org={org} />
          ))}
          {organizations.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No workspaces yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
