"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPicklistOption, renamePicklistOption, setPicklistOptionActive } from "@/lib/actions/picklists";
import type { AdminPicklistOption } from "@/lib/actions/picklists";
import type { PicklistKind } from "@/lib/picklists";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LISTS: { kind: PicklistKind; title: string; description: string; placeholder: string }[] = [
  {
    kind: "AGENCY",
    title: "Agencies",
    description: "The agency a Home Care case is filed with (Application → Agency).",
    placeholder: "e.g. Department of Health",
  },
  {
    kind: "PAYER",
    title: "MCOs / Payers",
    description: "Payers a client can credential with (Client → MCO Credentialing).",
    placeholder: "e.g. Aetna Better Health",
  },
  {
    kind: "BALL_WITH",
    title: "Ball is with",
    description: "Who the case is waiting on right now (Application → Ball is with).",
    placeholder: "e.g. Surveyor",
  },
];

function OptionRow({ option }: { option: AdminPicklistOption }) {
  const router = useRouter();
  const [label, setLabel] = useState(option.label);
  const [isSaving, startSaving] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onError?: () => void) {
    startSaving(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          onError?.();
          return;
        }
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the change. Please try again."));
        onError?.();
      }
    });
  }

  function handleRename() {
    const trimmed = label.trim();
    if (trimmed === option.label) return;
    run(() => renamePicklistOption(option.id, trimmed), () => setLabel(option.label));
  }

  return (
    <TableRow className={option.active ? undefined : "text-muted-foreground"}>
      <TableCell>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleRename}
          disabled={isSaving}
          className="h-8 max-w-xs"
          aria-label={`Name for ${option.label}`}
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{option.code}</TableCell>
      <TableCell>{option.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Retired</Badge>}</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" loading={isSaving} onClick={() => run(() => setPicklistOptionActive(option.id, !option.active))}>
          {option.active ? "Retire" : "Restore"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddOption({ kind, placeholder }: { kind: PicklistKind; placeholder: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!label.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createPicklistOption(kind, label);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setLabel("");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't add the option. Please try again."));
      }
    });
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        handleAdd();
      }}
    >
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} className="h-8 max-w-xs" />
      <Button type="submit" size="sm" loading={isPending}>
        Add
      </Button>
    </form>
  );
}

// One card per list. The code column is shown because it's what's stored
// on every case/credential — it's fixed at creation, so renaming an option
// relabels existing rows everywhere instead of orphaning them.
export function PicklistsManager({ lists }: { lists: Record<PicklistKind, AdminPicklistOption[]> }) {
  return (
    <div className="space-y-6">
      {LISTS.map(({ kind, title, description, placeholder }) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists[kind].map((option) => (
                  <OptionRow key={option.id} option={option} />
                ))}
                {lists[kind].length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No options yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <AddOption kind={kind} placeholder={placeholder} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
