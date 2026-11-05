"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Home } from "lucide-react";
import { switchWorkspace } from "@/lib/actions/workspaces";
import type { SwitchTarget } from "@/lib/workspace-switch";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Sidebar header for someone assigned to other workspaces
// (src/lib/workspace-switch.ts): the current workspace's name opens a list
// of the others; picking one opens it signed in there.
export function WorkspaceSwitcher({ currentName, targets }: { currentName: string; targets: SwitchTarget[] }) {
  const [isPending, startTransition] = useTransition();

  if (targets.length === 0) {
    return (
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <BrandLogo iconOnly className="h-7 shrink-0" />
        <span className="truncate font-heading text-lg font-semibold tracking-tight">{currentName}</span>
      </Link>
    );
  }

  function open(slug: string) {
    startTransition(async () => {
      const result = await switchWorkspace(slug);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-auto w-full justify-between gap-2 px-2 py-1.5 text-left" disabled={isPending} data-tour="workspace-switcher">
            <BrandLogo iconOnly className="h-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-heading text-lg font-semibold tracking-tight">{currentName}</span>
              <span className="block text-xs font-normal text-muted-foreground">{isPending ? "Opening…" : "Switch workspace"}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {targets.map((t) => (
            <DropdownMenuItem key={t.slug} disabled={t.current} onClick={() => open(t.slug)}>
              {t.home ? <Home className="size-4" /> : <span className="size-4" />}
              <span className="flex-1 truncate">{t.name}</span>
              {t.current && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
