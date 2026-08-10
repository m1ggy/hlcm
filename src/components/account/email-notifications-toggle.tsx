"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEmailNotifications } from "@/lib/actions/account";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function EmailNotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    const previous = enabled;
    setEnabled(checked);
    startTransition(async () => {
      try {
        await updateEmailNotifications(checked);
      } catch (error) {
        setEnabled(previous);
        toast.error(error instanceof Error ? error.message : "Failed to update email notifications");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="email-notifications"
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <Label htmlFor="email-notifications" className="text-sm font-normal">
        Email me about status changes, task assignments, and shared applications
      </Label>
    </div>
  );
}
