"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";

type Option = { value: string; label: string };

/**
 * Drop-in replacement for the plain `<Select>` (@/components/ui/select) when
 * the option list is long enough that scrolling to find one is a chore —
 * same `items`-as-id/label-map + `value`/`onValueChange` shape, but the
 * trigger opens a popup with a type-to-filter search box instead of a
 * scrolling list. Built on @base-ui/react's Combobox (same primitive family
 * Select already uses), not cmdk — https://base-ui.com/react/components/combobox.
 */
export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No matches.",
  disabled,
  className,
  size = "default",
}: {
  items: Record<string, string>;
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
}) {
  const options: Option[] = React.useMemo(
    () => Object.entries(items).map(([id, label]) => ({ value: id, label })),
    [items]
  );
  const selected = value ? (options.find((o) => o.value === value) ?? null) : null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next: Option | null) => onValueChange(next?.value ?? null)}
      itemToStringLabel={(item: Option) => item?.label ?? ""}
      isItemEqualToValue={(a: Option, b: Option) => a?.value === b?.value}
      disabled={disabled}
    >
      <ComboboxTrigger
        data-size={size}
        className={
          className ??
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-7 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50"
        }
      >
        {/* ComboboxValue renders no element of its own (just a Fragment) —
            wrap it so the label truncates instead of pushing the chevron
            off the edge of a narrow trigger. */}
        <span className="min-w-0 flex-1 truncate text-left">
          <ComboboxValue placeholder={placeholder} />
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: Option) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
