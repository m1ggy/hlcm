"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { createInvoiceProfile } from "@/lib/actions/invoice-profiles";
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
import { InvoiceProfileCard, type InvoiceProfileSummary } from "./invoice-profile-card";

export function InvoiceProfilesManager({ profiles }: { profiles: InvoiceProfileSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        await createInvoiceProfile({ name: name.trim() });
        toast.success("Profile created");
        setOpen(false);
        setName("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create profile");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline"><PlusCircle className="size-3.5" /> New profile</Button>} />
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New invoice profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="new-profile-name">Name</Label>
              <Input
                id="new-profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CTK, Sunrise Home Care"
              />
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {profiles.map((profile) => (
          <InvoiceProfileCard key={profile.id} profile={profile} canDelete={profiles.length > 1} />
        ))}
      </div>
    </div>
  );
}
