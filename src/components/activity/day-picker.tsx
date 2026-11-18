"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** Previous / date / next, kept in the URL as ?date=yyyy-MM-dd. */
export function DayPicker({ date }: { date: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const next = new URLSearchParams(params.toString());
    next.set("date", day);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => go(shiftDay(date, -1))}>
        <ChevronLeft />
      </Button>
      <Input type="date" value={date} onChange={(e) => go(e.target.value)} className="h-7 w-auto" />
      <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => go(shiftDay(date, 1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}
