"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { sendSetPasswordLink, updateUser } from "@/lib/actions/users";
import { unexpectedErrorMessage } from "@/lib/action-result";
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

// DEVELOPER is a real Role a user row can have (the superadmin, see
// prisma/schema.prisma), so it has to be in this type for real data to
// type-check. It's never assignable here, and a DEVELOPER row
// is always fully protected.
const ROLES = ["DEVELOPER", "OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"] as const;
// No CLIENT: the client portal is retired (share links replace it).
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "DEVELOPER" && r !== "CLIENT");
const ADMIN_TIER_ROLES = new Set<(typeof ROLES)[number]>(["OWNER", "ADMIN", "ACCOUNTANT"]);

type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  active: boolean;
  phone: string | null;
  smsRemindersEnabled: boolean;
  smsDailyUpdates?: boolean;
  smsOptedOutAt?: Date | null;
};

export function EditUserDialog({
  user,
  isSelf = false,
  canManageAdmins = false,
  dailyTextAvailable = false,
}: {
  user: EditableUser;
  isSelf?: boolean;
  canManageAdmins?: boolean;
  /** The workspace sends the evening text: offer signing this person up, with their consent. */
  dailyTextAvailable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  // A DEVELOPER row returns null below before this state is ever read/
  // submitted — the cast just satisfies updateUser's narrower input type.
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>(
    user.role as (typeof ASSIGNABLE_ROLES)[number]
  );
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [smsRemindersEnabled, setSmsRemindersEnabled] = useState(user.smsRemindersEnabled);
  const wasDaily = user.smsDailyUpdates ?? false;
  const [smsDailyUpdates, setSmsDailyUpdates] = useState(wasDaily);
  const [smsConsent, setSmsConsent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showDailyText = dailyTextAvailable && role !== "CAREGIVER";
  const optedOut = Boolean(user.smsOptedOutAt);
  const signingUp = showDailyText && smsDailyUpdates && !wasDaily;
  const [isSendingLink, startSendingLink] = useTransition();

  function handleSendLink() {
    startSendingLink(async () => {
      try {
        const { sent } = await sendSetPasswordLink(user.id);
        if (sent) toast.success(`Emailed ${user.email} a link to set their password`);
        else toast.error("Couldn't send the email — check the email settings and try again.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send the link");
      }
    });
  }

  // A DEVELOPER row is always protected, for every actor — see users.ts.
  const isProtected =
    user.role === "DEVELOPER" || (ADMIN_TIER_ROLES.has(user.role) && !canManageAdmins && !isSelf);
  const availableRoles =
    canManageAdmins || isSelf ? ASSIGNABLE_ROLES : ASSIGNABLE_ROLES.filter((r) => !ADMIN_TIER_ROLES.has(r));

  function reset() {
    setName(user.name);
    setEmail(user.email);
    setRole(user.role as (typeof ASSIGNABLE_ROLES)[number]);
    setActive(user.active);
    setPassword("");
    setPhone(user.phone ?? "");
    setSmsRemindersEnabled(user.smsRemindersEnabled);
    setSmsDailyUpdates(wasDaily);
    setSmsConsent(false);
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
    if (signingUp && !phone.trim()) {
      toast.error("Add their mobile number to send the evening text");
      return;
    }
    if (signingUp && !smsConsent) {
      toast.error("Confirm they agreed to get the evening text");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateUser({
          userId: user.id,
          name,
          email,
          role,
          active,
          password: password || undefined,
          phone: phone || undefined,
          smsRemindersEnabled,
          ...(showDailyText && { smsDailyUpdates, smsConsent }),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("User updated");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Failed to update user"));
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
              onValueChange={(v) => setRole((v ?? role) as (typeof ASSIGNABLE_ROLES)[number])}
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
              placeholder="For text reminders and alerts"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={smsRemindersEnabled} onCheckedChange={(c) => setSmsRemindersEnabled(c === true)} />
            Send this person a text/call before every upcoming meeting
          </label>
          {showDailyText && (
            <div className="space-y-2 rounded-md border p-3">
              {optedOut && !wasDaily ? (
                <p className="text-sm text-muted-foreground">
                  They replied STOP to our texts, so only they can turn the evening text back on, from their Account page.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={smsDailyUpdates}
                      onCheckedChange={(c) => {
                        setSmsDailyUpdates(c === true);
                        if (c !== true) setSmsConsent(false);
                      }}
                    />
                    Text this person the evening update
                  </label>
                  {signingUp && (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox className="mt-0.5" checked={smsConsent} onCheckedChange={(c) => setSmsConsent(c === true)} />
                      <span>
                        They agreed to get these texts at the number above. They can reply STOP at any time.
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
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
          {user.active && (
            <Button variant="outline" className="w-full" onClick={handleSendLink} loading={isSendingLink}>
              Email a set-password link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
