"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createLicenseType } from "@/lib/actions/license-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewLicenseTypeDialog({ pipelines }: { pipelines: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pipeline, setPipeline] = useState<string | null>(pipelines[0]?.value ?? null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    if (pipeline) formData.set("pipeline", pipeline);
    startTransition(async () => {
      try {
        await createLicenseType(formData);
        toast.success("License type created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create license type");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New License Type</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New License Type</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="e.g. Home Care" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-1">
            <Label>Pipeline</Label>
            <SearchableSelect
              items={Object.fromEntries(pipelines.map((p) => [p.value, p.label]))}
              value={pipeline}
              onValueChange={(v) => setPipeline(v ?? pipeline)}
              searchPlaceholder="Search pipelines..."
            />
            <p className="text-xs text-muted-foreground">The stages a case with this license type moves through.</p>
          </div>
          <Button type="submit" className="w-full" loading={isPending} disabled={!pipeline}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
