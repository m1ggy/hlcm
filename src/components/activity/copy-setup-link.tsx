"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// For the owner: the address of the desktop app's set-up page, to send to
// staff who haven't installed it yet ("app not installed" on Team activity).
export function CopySetupLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/time/app`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Set-up link copied. Send it to your staff.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Couldn't copy. The link is ${link}`);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? <Check /> : <Copy />} Copy set-up link for staff
    </Button>
  );
}
