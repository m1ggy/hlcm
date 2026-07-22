"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { changePassword } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordChangeForm() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await changePassword(formData);
        toast.success("Password changed");
        formRef.current?.reset();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to change password");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}
