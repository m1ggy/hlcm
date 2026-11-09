"use client";

import { useEffect, useRef } from "react";
import { enterSwitchedWorkspace } from "@/lib/actions/workspaces";
import { Button } from "@/components/ui/button";

export function SwitchEnterForm({ token, next }: { token: string; next?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    form.current?.requestSubmit();
  }, []);

  return (
    <form ref={form} action={enterSwitchedWorkspace}>
      <input type="hidden" name="token" value={token} />
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}
