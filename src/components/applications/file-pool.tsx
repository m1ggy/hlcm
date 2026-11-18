"use client";

import { deleteFile } from "@/lib/actions/files";
import { SendEnvelopeDialog } from "@/components/applications/send-envelope-dialog";
import { EnvelopeStatusList, type EnvelopeRow } from "@/components/applications/envelope-status-list";
import { FileBrowser } from "@/components/files/file-browser";
import type { FileRow } from "@/components/files/types";
import type { FolderRow } from "@/lib/file-folders";

// An application's files, in folders (docs/file-management-plan.md), with
// its DocuSign envelopes above them.
export function FilePool({
  applicationId,
  files,
  folders,
  envelopes,
  canEdit,
}: {
  applicationId: string;
  files: FileRow[];
  folders: FolderRow[];
  envelopes: EnvelopeRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <EnvelopeStatusList envelopes={envelopes} canEdit={canEdit} />
      <FileBrowser
        owner={{ kind: "application", id: applicationId }}
        folders={folders}
        files={files}
        canEdit={canEdit}
        onDeleteFile={(fileId) => deleteFile(fileId, applicationId)}
        signAction={(file) =>
          canEdit && file.mimeType === "application/pdf" && !file.isSigned ? (
            <SendEnvelopeDialog fileAssetId={file.id} fileName={file.fileName} parent={{ kind: "application", applicationId }} />
          ) : undefined
        }
      />
    </div>
  );
}
