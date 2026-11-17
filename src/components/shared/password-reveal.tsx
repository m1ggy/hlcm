"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * A password we just made up (src/lib/generated-password.ts), shown once:
 * only its hash is kept, so this is the one chance to copy it. `signIn` is
 * what they type in the first box — their email or phone number.
 */
export function PasswordReveal({ name, signIn, password, address }: { name: string; signIn: string | null; password: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  const where = address ?? (typeof window !== "undefined" ? window.location.host : "");
  const text = `${where ? `Sign in at ${where}\n` : ""}${signIn ? `Email or phone: ${signIn}\n` : ""}Password: ${password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Give these to <span className="font-medium">{name}</span>. This is the only time the password is shown — copy it now.
      </p>
      <dl className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
        {where && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Sign in at</dt>
            <dd className="font-medium break-all">{where}</dd>
          </div>
        )}
        {signIn && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Email or phone</dt>
            <dd className="font-medium break-all">{signIn}</dd>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-muted-foreground">Password</dt>
          <dd className="font-mono text-base font-semibold tracking-wide break-all" data-testid="generated-password">
            {password}
          </dd>
        </div>
      </dl>
      <Button type="button" variant="outline" className="w-full" onClick={copy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy sign-in details"}
      </Button>
    </div>
  );
}
