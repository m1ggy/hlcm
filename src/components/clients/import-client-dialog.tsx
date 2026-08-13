"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importClientToProject } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type ClientOption = { id: string; name: string; projectIds: string[] };

// Links a client that already exists (usually under a different project)
// into this one, instead of re-entering the same business from scratch.
export function ImportClientDialog({
  projectId,
  clients,
}: {
  projectId: string;
  clients: ClientOption[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const available = clients.filter((client) => !client.projectIds.includes(projectId));

  function handleImport(clientId: string) {
    startTransition(async () => {
      try {
        await importClientToProject(clientId, projectId);
        toast.success("Client added to project");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to import client");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Import Client</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import an existing client</DialogTitle>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search clients..." />
          <CommandList>
            <CommandEmpty>
              {available.length === 0 ? "Every client is already in this project." : "No matches."}
            </CommandEmpty>
            <CommandGroup>
              {available.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.name}
                  disabled={isPending}
                  onSelect={() => handleImport(client.id)}
                >
                  {client.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
