"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookmarkPlus, Repeat, Trash2 } from "lucide-react";
import { createFromTemplateAction, deleteTemplateAction, listTemplatesAction } from "@/lib/actions/work";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Template = { id: string; title: string; subtasks: number; repeat: string | null };

/**
 * "From template" on a project (workspace tasks Phase 5): the project's saved
 * tasks — pick one to make a fresh copy (with its subtasks) and open it.
 * Templates are saved from a task's panel ("Save as template").
 */
export function TemplateMenu({ projectId, onCreated }: { projectId: string; onCreated: (taskId: string) => void }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [pending, start] = useTransition();

  function load() {
    listTemplatesAction(projectId).then((r) => (r.ok ? setTemplates(r.data) : toast.error(r.error)));
  }

  function use(id: string) {
    start(async () => {
      const r = await createFromTemplateAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
      onCreated(r.data.id);
    });
  }

  function remove(t: Template) {
    if (!window.confirm(`Delete the template "${t.title}"? Tasks already made from it stay.`)) return;
    start(async () => {
      const r = await deleteTemplateAction(t.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setTemplates((cur) => (cur ?? []).filter((x) => x.id !== t.id));
    });
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
        <BookmarkPlus className="size-4" /> From template
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>New task from a template</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {templates === null ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No templates yet. Open a task and choose &ldquo;Save as template&rdquo;.</p>
        ) : (
          templates.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => use(t.id)} className="justify-between">
              <span className="min-w-0 truncate">
                {t.title}
                <span className="ml-1 text-xs text-muted-foreground">
                  {t.subtasks ? `· ${t.subtasks} subtasks` : ""}
                  {t.repeat && <Repeat className="ml-1 inline size-3" aria-label="Repeats" />}
                </span>
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Delete template ${t.title}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  remove(t);
                }}
              >
                <Trash2 className="size-3.5" />
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
