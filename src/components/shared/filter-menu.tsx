"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FilterOption = { value: string; label: string; count?: number; icon?: ReactNode };

/**
 * One multi-select filter as a compact dropdown button — "Status", or
 * "Status: Active" / "Status · 3" once something's picked. Checking items
 * keeps the menu open so several can be picked in one go.
 */
export function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const picked = options.filter((o) => selected.includes(o.value));
  const summary = picked.length === 1 ? `: ${picked[0].label}` : picked.length > 1 ? ` · ${picked.length}` : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={picked.length > 0 ? "border-primary/60 bg-primary/5 text-foreground" : "text-muted-foreground"}
          >
            <span className="max-w-48 truncate">
              {label}
              {summary}
            </span>
            <ChevronDown className="size-4 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent className="w-auto max-h-80 min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
              closeOnClick={false}
            >
              {option.icon}
              <span className="flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="ml-3 text-xs tabular-nums text-muted-foreground">{option.count}</span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {picked.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear} className="text-muted-foreground">
              Clear {label.toLowerCase()} filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
