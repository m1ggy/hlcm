"use client";

import { useActionState } from "react";
import { requestWorkspaceLinks } from "@/lib/actions/workspace-finder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FindWorkspaceForm({ productName }: { productName: string }) {
  const [state, formAction, pending] = useActionState(requestWorkspaceLinks, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{productName} — Find your workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {state?.message ? (
            <p className="text-sm">{state.message}</p>
          ) : (
            <form action={formAction} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Each organization signs in at its own address. Enter your email and we&apos;ll send you a link to yours.
              </p>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending…" : "Email me my workspace links"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
