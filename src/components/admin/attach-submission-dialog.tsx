"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { linkSubmissionToClient } from "@/lib/actions/form-submissions";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// No answers are copied onto the client automatically here — pick the
// client, then update its own page by hand, referencing the submission's
// answers still showing in this review row. Matches the "review, then
// merge in" decision this whole feature started from.
export function AttachSubmissionDialog({
  submissionId,
  clients,
}: {
  submissionId: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState<string | null>(null);

  function handleAttach() {
    if (!clientId) {
      toast.error("Pick a client");
      return;
    }
    startTransition(async () => {
      try {
        await linkSubmissionToClient(submissionId, clientId);
        toast.success("Attached to client");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to attach");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline"><Link2 className="size-3.5" /> Attach to existing client</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Attach to an existing client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SearchableSelect
            items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
            value={clientId}
            onValueChange={setClientId}
            searchPlaceholder="Search clients..."
          />
          <Button onClick={handleAttach} className="w-full" loading={isPending}>
            Attach
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
