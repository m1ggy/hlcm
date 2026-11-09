import type { CorrespondenceFull } from "@/lib/correspondence";
import type { CorrespondenceRow } from "@/components/correspondence/correspondence-types";

/** What the timeline gets: plain fields, no storage keys. */
export function toCorrespondenceRow(e: CorrespondenceFull): CorrespondenceRow {
  return {
    id: e.id,
    kind: e.kind,
    direction: e.direction,
    subject: e.subject,
    fromParty: e.fromParty,
    toParty: e.toParty,
    occurredAt: e.occurredAt.toISOString(),
    body: e.body,
    clientVisible: e.clientVisible,
    createdAt: e.createdAt.toISOString(),
    createdBy: e.createdBy,
    task: e.task,
    applicationId: e.applicationId,
    attachments: e.attachments,
  };
}
