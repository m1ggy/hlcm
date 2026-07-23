"use client";

import { useRouter } from "next/navigation";
import { CommentThread } from "@/components/comment-thread";
import { addNote } from "@/lib/actions/notes";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
};

export function NotesPanel({
  applicationId,
  notes,
  mentionableUsers,
}: {
  applicationId: string;
  notes: Note[];
  mentionableUsers: { id: string; name: string }[];
}) {
  const router = useRouter();

  async function handleSubmit(body: string, mentionedUserIds: string[]) {
    await addNote({ applicationId, body, mentionedUserIds });
    router.refresh();
  }

  return <CommentThread notes={notes} mentionableUsers={mentionableUsers} onSubmit={handleSubmit} />;
}
