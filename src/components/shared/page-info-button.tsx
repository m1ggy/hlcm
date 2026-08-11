"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Replaces the "paragraph of muted text under the h1" pattern every list
// page used to repeat — the explanation still exists, it's just a click
// away instead of permanent chrome eating vertical space above the table.
export function PageInfoButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" title={`About ${title}`} />}>
        <Info className="size-4 text-muted-foreground" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
