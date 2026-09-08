"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// `path` is site-relative (e.g. "/forms/home-care-intake") — resolved
// against window.location.origin at click time so this works the same in
// every environment without needing NEXT_PUBLIC_APP_URL wired through to
// the client.
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="font-mono text-xs">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {path}
    </Button>
  );
}
