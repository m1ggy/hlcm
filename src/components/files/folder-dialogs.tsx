"use client";

import { useState } from "react";
import { Folder, FolderOpen, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FolderRow } from "@/lib/file-folders";

/** One text field: new folder, rename folder, rename file. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  submitLabel,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initial: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Keyed on open so it starts from `initial` every time. */}
        <form
          key={String(open) + initial}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (name) onSubmit(name);
          }}
        >
          <Input
            name="name"
            aria-label={label}
            placeholder={label}
            defaultValue={initial}
            autoFocus
            maxLength={255}
            onFocus={(e) => {
              // Select the name without its extension, like a desktop rename.
              const dot = e.currentTarget.value.lastIndexOf(".");
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length);
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TreeLine = { folder: FolderRow; depth: number };

function flattenTree(folders: FolderRow[], hide: Set<string>) {
  const kids = new Map<string | null, FolderRow[]>();
  for (const f of folders) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f]);
  const out: TreeLine[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const f of (kids.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (hide.has(f.id)) continue;
      out.push({ folder: f, depth });
      visit(f.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** The ids of a folder and everything under it. */
export function subtreeIds(folders: FolderRow[], rootId: string) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Pick where to move files or a folder: the top level or any folder. */
export function MoveDialog({
  open,
  onOpenChange,
  title,
  folders,
  hide,
  current,
  pending,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  folders: FolderRow[];
  /** Folders that can't be picked (a moving folder and its subfolders). */
  hide?: Set<string>;
  /** Where the items are now — picking it again does nothing. */
  current: string | null;
  pending: boolean;
  onMove: (folderId: string | null) => void;
}) {
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const lines = flattenTree(folders, hide ?? new Set());
  const target = picked === undefined ? current : picked;

  const row = (id: string | null, name: string, depth: number) => {
    const active = target === id;
    const Icon = id === null ? Home : active ? FolderOpen : Folder;
    return (
      <button
        key={id ?? "__top"}
        type="button"
        onClick={() => setPicked(id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
          active && "bg-accent font-medium"
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
        {id === current && <span className="ml-auto shrink-0 text-xs text-muted-foreground">current</span>}
      </button>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto rounded-lg border p-1">
          {row(null, "Files (top level)", 0)}
          {lines.map(({ folder, depth }) => row(folder.id, folder.name, depth + 1))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={pending} disabled={target === current} onClick={() => onMove(target ?? null)}>
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
