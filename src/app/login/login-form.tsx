"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";

/** Signing in here to get back into a client workspace (src/app/login/page.tsx). */
export type ReturnTo = { slug: string; name: string; next: string | null; directUrl: string };

export function LoginForm({ title, returnTo }: { title: string; returnTo?: ReturnTo }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <BrandLogo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {returnTo && (
              <>
                <input type="hidden" name="workspace" value={returnTo.slug} />
                {returnTo.next && <input type="hidden" name="next" value={returnTo.next} />}
                <p className="rounded-md bg-muted p-3 text-sm">
                  You were signed out of <strong>{returnTo.name}</strong>. Sign in here and you&apos;ll go straight back to it.
                </p>
              </>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email or phone</Label>
              {/* Caregivers without an email sign in with their phone number (docs/client-care-plan.md). */}
              <Input id="email" name="email" type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </Button>
            <Link href="/forgot-password" className="block text-center text-sm text-muted-foreground hover:underline">
              Forgot password?
            </Link>
            {returnTo && (
              <a href={returnTo.directUrl} className="block text-center text-sm text-muted-foreground hover:underline">
                Have your own {returnTo.name} account? Sign in there
              </a>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
