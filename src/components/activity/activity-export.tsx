"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function minusDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** Date range + CSV / Excel / PDF download of /api/export/activity. */
export function ActivityExport({ date }: { date: string }) {
  const [from, setFrom] = useState(minusDays(date, 6));
  const [to, setTo] = useState(date);
  const href = (format: string) => `/api/export/activity?from=${from}&to=${to}&format=${format}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Report</span>
      <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-7 w-auto" aria-label="From" />
      <span className="text-muted-foreground">to</span>
      <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-7 w-auto" aria-label="To" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <Download /> Download
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem render={<a href={href("csv")} />}>CSV</DropdownMenuItem>
          <DropdownMenuItem render={<a href={href("xlsx")} />}>Excel</DropdownMenuItem>
          <DropdownMenuItem render={<a href={href("pdf")} />}>PDF</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
