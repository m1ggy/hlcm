"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { startMfaEnrollment, verifyAndEnableMfa, disableMfa } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MfaSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      try {
        const result = await startMfaEnrollment();
        setEnrollment(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to start MFA enrollment");
      }
    });
  }

  function handleVerify(formData: FormData) {
    startTransition(async () => {
      try {
        await verifyAndEnableMfa(formData);
        toast.success("MFA enabled");
        setEnabled(true);
        setEnrollment(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invalid code");
      }
    });
  }

  function handleDisable() {
    startTransition(async () => {
      try {
        await disableMfa();
        toast.success("MFA disabled");
        setEnabled(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disable MFA");
      }
    });
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Multi-factor authentication is <span className="font-medium text-foreground">enabled</span> on your account.
        </p>
        <Button variant="outline" onClick={handleDisable} disabled={isPending}>
          {isPending ? "Disabling..." : "Disable MFA"}
        </Button>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Multi-factor authentication is not enabled. Add it for an extra layer of protection on your account.
        </p>
        <Button onClick={handleStart} disabled={isPending}>
          {isPending ? "Starting..." : "Enable MFA"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), or enter the key manually.
      </p>
      <Image src={enrollment.qrDataUrl} alt="MFA QR code" width={200} height={200} unoptimized />
      <p className="font-mono text-xs break-all text-muted-foreground">{enrollment.secret}</p>
      <form action={handleVerify} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="code">Enter the 6-digit code to confirm</Label>
          <Input id="code" name="code" inputMode="numeric" required maxLength={6} className="max-w-[10rem]" />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Verifying..." : "Verify & enable"}
        </Button>
      </form>
    </div>
  );
}
