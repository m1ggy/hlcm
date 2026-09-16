"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUser } from "@/lib/actions/users";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"] as const;
const ADMIN_TIER_ROLES = new Set<(typeof ROLES)[number]>(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function NewUserDialog({ canAssignAdmin = false }: { canAssignAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number]>("STAFF");
  const [isPending, startTransition] = useTransition();
  const availableRoles = canAssignAdmin ? ROLES : ROLES.filter((r) => !ADMIN_TIER_ROLES.has(r));

  function handleSubmit(formData: FormData) {
    formData.set("role", role);
    startTransition(async () => {
      try {
        await createUser(formData);
        toast.success("User created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create user");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New User</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New User</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Temporary password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
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
          <Button type="submit" className="w-full" loading={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
