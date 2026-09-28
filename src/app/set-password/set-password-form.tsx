"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setPasswordWithToken } from "@/lib/actions/password";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm({ token, title, email }: { token: string; title: string; email: string }) {
  const [state, formAction, pending] = useActionState(setPasswordWithToken, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {state?.done ? (
            <div className="space-y-4">
              <p className="text-sm">Your password is set. You can sign in now.</p>
              <Link href="/login" className={buttonVariants({ className: "w-full" })}>
                Go to sign in
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">For {email}</p>
              <div className="space-y-1">
                <Label htmlFor="password">New password</Label>
                <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Saving…" : "Set password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
