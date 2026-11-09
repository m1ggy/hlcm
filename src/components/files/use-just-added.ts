"use client";

import { useState } from "react";

/**
 * Shows a just-uploaded row straight away, without waiting for
 * router.refresh() to bring back fresh server props (after an upload through
 * /api/uploads that refresh can land before the new row is visible). Once
 * the server's list includes the row, the server copy wins.
 */
export function useJustAdded<T extends { id: string }>(serverRows: T[]) {
  const [added, setAdded] = useState<T[]>([]);
  const serverIds = new Set(serverRows.map((r) => r.id));
  const rows = [...added.filter((r) => !serverIds.has(r.id)), ...serverRows];

  return {
    rows,
    add: (row: T) => setAdded((current) => [row, ...current.filter((r) => r.id !== row.id)]),
    remove: (id: string) => setAdded((current) => current.filter((r) => r.id !== id)),
  };
}
