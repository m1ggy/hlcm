"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
};

type MentionableUser = { id: string; name: string };

// Shared by Application comments and Task comments — the entity-specific
// wrapper just supplies the notes list and an onSubmit that calls the right
// server action, so the mention-detection UI isn't duplicated per entity.
export function CommentThread({
  notes,
  mentionableUsers,
  onSubmit,
}: {
  notes: Note[];
  mentionableUsers: MentionableUser[];
  onSubmit: (body: string, mentionedUserIds: string[]) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, mentionableUsers]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);

    const cursor = e.target.selectionStart;
    const upToCursor = value.slice(0, cursor);
    const match = upToCursor.match(/@([A-Za-z0-9 ]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(user: MentionableUser) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const upToCursor = body.slice(0, cursor);
    const afterCursor = body.slice(cursor);
    const replaced = upToCursor.replace(/@([A-Za-z0-9 ]*)$/, `@${user.name} `);

    setBody(replaced + afterCursor);
    setMentionedIds((prev) => new Set(prev).add(user.id));
    setMentionQuery(null);
    requestAnimationFrame(() => textarea.focus());
  }

  function handleSubmit() {
    if (!body.trim()) {
      toast.error("Write a comment first");
      return;
    }
    startTransition(async () => {
      try {
        await onSubmit(body.trim(), [...mentionedIds]);
        setBody("");
        setMentionedIds(new Set());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to post comment");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {notes.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        {notes.map((note) => (
          <div key={note.id} className="flex gap-3">
            <AvatarInitials name={note.author.name} />
            <div className="min-w-0 flex-1 rounded-lg bg-muted/40 p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{note.author.name}</span>
                <span className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative space-y-2">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full z-10 mb-1 w-64 rounded-lg border bg-popover p-1 shadow-md">
            {mentionMatches.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => insertMention(u)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <AvatarInitials name={u.name} className="size-5 text-[0.6rem]" />
                {u.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          placeholder="Add a comment... use @ to mention someone"
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button size="sm" onClick={handleSubmit} disabled={isPending}>
          Comment
        </Button>
      </div>
    </div>
  );
}
