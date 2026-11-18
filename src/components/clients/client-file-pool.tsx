"use client";

import { Card, CardContent } from "@/components/ui/card";
import { deleteClientFile } from "@/lib/actions/files";
import { FileBrowser } from "@/components/files/file-browser";
import type { FileRow } from "@/components/files/types";
import type { FolderRow } from "@/lib/file-folders";

// The client's own files — the signed agreement, EIN letter, W-9, licenses,
// insurance certificates — in folders (docs/file-management-plan.md).
// Sending a file for a DocuSign signature is a ClientAgreement-scoped flow
// (SendAgreementEnvelopeDialog on client-agreements-card.tsx), not a generic
// action on every client file, so no signAction here.
//
// On a service page the folders are the client's, the files are only that
// service's, and uploads are filed under the service and the open folder.
export function ClientFilePool({
  clientId,
  clientServiceId,
  files,
  folders,
  canEdit,
}: {
  clientId: string;
  /** Set on a service page — uploads are filed under that service. */
  clientServiceId?: string;
  files: FileRow[];
  folders: FolderRow[];
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 text-base font-medium">Files</h2>
        <FileBrowser
          owner={{ kind: "client", id: clientId }}
          folders={folders}
          files={files}
          canEdit={canEdit}
          uploadExtra={clientServiceId ? { clientServiceId } : undefined}
          onDeleteFile={(fileId) => deleteClientFile(fileId, clientId)}
          emptyText={clientServiceId ? "No files for this service yet" : "No files yet"}
        />
      </CardContent>
    </Card>
  );
}
