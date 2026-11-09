"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { switchWorkspace } from "@/lib/actions/workspaces";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/** Opens a page in another workspace I'm assigned to (a one-time switch link that lands on `path`). */
export function OpenInWorkspace({ slug, path, children, className }: { slug: string; path: string; children: React.ReactNode; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={cn("group flex w-full items-center gap-3 text-left disabled:opacity-60", className)}
      onClick={() =>
        start(async () => {
          try {
            const result = await switchWorkspace(slug, path);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            window.location.assign(result.data.url);
          } catch (error) {
            toast.error(unexpectedErrorMessage(error, "Couldn't open that workspace"));
          }
        })
      }
    >
      {children}
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </button>
  );
}
