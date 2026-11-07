"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEodRequiredAction } from "@/lib/actions/eod";
import { Checkbox } from "@/components/ui/checkbox";

/** Team page: whether someone is expected to submit an EOD (gets the 6 pm reminder, shows as missing). */
export function RequiredToggle({ userId, required, name }: { userId: string; required: boolean; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Checkbox
      checked={required}
      disabled={pending}
      aria-label={`${name} is expected to submit daily`}
      onCheckedChange={(checked) =>
        start(async () => {
          const result = await setEodRequiredAction(userId, Boolean(checked));
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        })
      }
    />
  );
}
