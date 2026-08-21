"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChipInput,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";

type Option = { value: string; label: string };

/**
 * Multi-select sibling of `SearchableSelect` — same `items`-as-id/label-map
 * shape, but `value`/`onValueChange` are arrays and each pick shows up as a
 * removable chip inline in the field (base-ui's Combobox `multiple` mode:
 * https://base-ui.com/react/components/combobox#multiple-select). Used for
 * task assignees/reviewers, where more than one person can hold the role.
 */
export function MultiUserSelect({
  items,
  value,
  onValueChange,
  placeholder = "Search people...",
  emptyText = "No matches.",
  disabled,
  className,
}: {
  items: Record<string, string>;
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const options: Option[] = React.useMemo(
    () => Object.entries(items).map(([id, label]) => ({ value: id, label })),
    [items]
  );
  const selected = React.useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value]
  );

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next: Option[]) => onValueChange(next.map((o) => o.value))}
      itemToStringLabel={(item: Option) => item?.label ?? ""}
      isItemEqualToValue={(a: Option, b: Option) => a?.value === b?.value}
      multiple
      disabled={disabled}
    >
      <ComboboxInputGroup className={className}>
        <ComboboxChips>
          {/* ComboboxValue renders no element of its own — its render-prop
              child is how the chips get the array of currently-selected
              options (same reason SearchableSelect wraps it in a span). */}
          <ComboboxValue>
            {(selectedItems: Option[]) => (
              <>
                {selectedItems.map((item) => (
                  <ComboboxChip key={item.value} aria-label={item.label}>
                    {item.label}
                    <ComboboxChipRemove aria-label={`Remove ${item.label}`} />
                  </ComboboxChip>
                ))}
                <ComboboxChipInput placeholder={selectedItems.length > 0 ? "" : placeholder} disabled={disabled} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
      </ComboboxInputGroup>
      <ComboboxContent>
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
