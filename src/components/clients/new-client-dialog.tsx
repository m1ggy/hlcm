"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewClientDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("projectId", projectId);
    startTransition(async () => {
      try {
        await createClient(formData);
        toast.success("Client created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create client");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New Client</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactInfo">Contact Info</Label>
            <Input id="contactInfo" name="contactInfo" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
