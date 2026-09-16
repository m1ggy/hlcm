"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateUser } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"] as const;
const ADMIN_TIER_ROLES = new Set<(typeof ROLES)[number]>(["OWNER", "ADMIN", "ACCOUNTANT"]);

type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  active: boolean;
  phone: string | null;
  smsRemindersEnabled: boolean;
};

export function EditUserDialog({
  user,
  isSelf = false,
  canManageAdmins = false,
}: {
  user: EditableUser;
  isSelf?: boolean;
  canManageAdmins?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<(typeof ROLES)[number]>(user.role);
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [smsRemindersEnabled, setSmsRemindersEnabled] = useState(user.smsRemindersEnabled);
  const [isPending, startTransition] = useTransition();

  const isProtected = ADMIN_TIER_ROLES.has(user.role) && !canManageAdmins && !isSelf;
  const availableRoles = canManageAdmins || isSelf ? ROLES : ROLES.filter((r) => !ADMIN_TIER_ROLES.has(r));

  function reset() {
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setActive(user.active);
    setPassword("");
    setPhone(user.phone ?? "");
    setSmsRemindersEnabled(user.smsRemindersEnabled);
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (smsRemindersEnabled && !phone.trim()) {
      toast.error("Add a phone number to enable SMS/call reminders");
      return;
    }
    startTransition(async () => {
      try {
        await updateUser({
          userId: user.id,
          name,
          email,
          role,
          active,
          password: password || undefined,
          phone: phone || undefined,
          smsRemindersEnabled,
        });
        toast.success("User updated");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update user");
      }
    });
  }

  // Only an Owner can edit another Admin/Owner account — an Admin managing
  // everyone below just doesn't get the affordance for those rows.
  if (isProtected) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Edit user" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole((v ?? role) as (typeof ROLES)[number])}
              disabled={isSelf}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-password">New password</Label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              minLength={8}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="For SMS/call meeting reminders"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={smsRemindersEnabled} onCheckedChange={(c) => setSmsRemindersEnabled(c === true)} />
            Send this person a text/call before every upcoming meeting
          </label>
          <label className={`flex items-center gap-2 text-sm ${isSelf ? "opacity-50" : ""}`}>
            <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} disabled={isSelf} />
            Active — deactivating blocks sign-in without deleting their account
          </label>
          {isSelf && (
            <p className="text-xs text-muted-foreground">
              You can&apos;t change your own role or deactivate yourself — ask another admin.
            </p>
          )}
          <Button className="w-full" onClick={handleSave} loading={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
