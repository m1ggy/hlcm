"use client";

import { useActionState } from "react";
import { verifyMfaAction, cancelMfaAction } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function MfaForm() {
  const [state, formAction, pending] = useActionState(verifyMfaAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Enter your MFA code</CardTitle>
          <CardDescription>Open your authenticator app and enter the 6-digit code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="otp">MFA code</Label>
              <Input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Verifying..." : "Verify"}
            </Button>
          </form>
          <form action={cancelMfaAction} className="mt-2">
            <button type="submit" className="w-full text-center text-sm text-muted-foreground hover:underline">
              Back to sign in
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
