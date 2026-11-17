"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUser } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordReveal } from "@/components/shared/password-reveal";
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

// No CLIENT: the client portal is retired (share links replace it).
const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CAREGIVER"] as const;
const ADMIN_TIER_ROLES = new Set<(typeof ROLES)[number]>(["OWNER", "ADMIN", "ACCOUNTANT"]);

type PasswordMode = "invite" | "generate" | "type";

export function NewUserDialog({ canAssignAdmin = false }: { canAssignAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number]>("STAFF");
  // Default: email an invite so the admin never handles someone's password.
  // Or make one up here (src/lib/generated-password.ts) for people who won't
  // set their own — the default for a caregiver.
  const [mode, setMode] = useState<PasswordMode>("invite");
  const [created, setCreated] = useState<{ name: string; signIn: string | null; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const availableRoles = canAssignAdmin ? ROLES : ROLES.filter((r) => !ADMIN_TIER_ROLES.has(r));
  const isCaregiver = role === "CAREGIVER";

  function pickRole(next: (typeof ROLES)[number]) {
    setRole(next);
    if (next === "CAREGIVER" && mode === "invite") setMode("generate");
  }

  function handleSubmit(formData: FormData) {
    formData.set("role", role);
    formData.set("invite", String(mode === "invite"));
    formData.set("generate", String(mode === "generate"));
    startTransition(async () => {
      try {
        const { inviteSent, password } = await createUser(formData);
        if (password) {
          const email = String(formData.get("email") ?? "").trim();
          const phone = String(formData.get("phone") ?? "").trim();
          setCreated({ name: String(formData.get("name") ?? ""), signIn: email || phone || null, password });
          toast.success("User created");
          return;
        }
        if (inviteSent === false) toast.warning("User created, but the invite email couldn't be sent — use \"Email a set-password link\" from their row to retry.");
        else toast.success(inviteSent ? "User created and invite sent" : "User created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create user");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreated(null);
          setRole("STAFF");
          setMode("invite");
        }
      }}
    >
      <DialogTrigger render={<Button>New User</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "User created" : "New User"}</DialogTitle>
        </DialogHeader>
        {created ? (
          <div className="space-y-3">
            <PasswordReveal name={created.name} signIn={created.signIn} password={created.password} />
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => pickRole(v as (typeof ROLES)[number])}>
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
              <Label htmlFor="email">
                Email{isCaregiver && <span className="font-normal text-muted-foreground"> (optional — or sign in by phone)</span>}
              </Label>
              <Input id="email" name="email" type="email" required={!isCaregiver} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">
                Mobile phone <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />
              {isCaregiver && <p className="text-xs text-muted-foreground">Without an email, they sign in with this number.</p>}
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PasswordMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      v === "invite" ? "Email an invite — they choose their own" : v === "generate" ? "Make one up for them" : "Type one in"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Email an invite — they choose their own</SelectItem>
                  <SelectItem value="generate">Make one up for them</SelectItem>
                  <SelectItem value="type">Type one in</SelectItem>
                </SelectContent>
              </Select>
              {mode === "generate" && (
                <p className="text-xs text-muted-foreground">You&apos;ll see it once after creating, to pass on to them.</p>
              )}
            </div>
            {mode === "type" && (
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required minLength={8} />
              </div>
            )}
            <Button type="submit" className="w-full" loading={isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
