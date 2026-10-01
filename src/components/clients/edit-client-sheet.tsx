"use client";

import type { ComponentProps } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ClientDetailsForm } from "@/components/clients/client-details-form";

/** The header's "Edit Client" — the same autosaving details form, in a side panel. */
export function EditClientSheet(props: ComponentProps<typeof ClientDetailsForm>) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline">
            <Pencil className="size-3.5" /> Edit Client
          </Button>
        }
      />
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pb-0">
          <SheetTitle>Edit client</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ClientDetailsForm {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
