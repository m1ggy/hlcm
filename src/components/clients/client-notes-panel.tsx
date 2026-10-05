"use client";

import { useRouter } from "next/navigation";
import { CommentThread } from "@/components/comment-thread";
import { addClientNote } from "@/lib/actions/notes";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
};

export function ClientNotesPanel({
  clientId,
  clientServiceId,
  notes,
  mentionableUsers,
}: {
  clientId: string;
  /** Set on a service page — new notes go on that service's thread. */
  clientServiceId?: string;
  notes: Note[];
  mentionableUsers: { id: string; name: string }[];
}) {
  const router = useRouter();

  async function handleSubmit(body: string, mentionedUserIds: string[]) {
    await addClientNote({ clientId, clientServiceId, body, mentionedUserIds });
    router.refresh();
  }

  return <CommentThread notes={notes} mentionableUsers={mentionableUsers} onSubmit={handleSubmit} />;
}
