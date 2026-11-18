export type FileRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
  versionCount: number;
  isSigned: boolean;
  /** Client and application files only (docs/file-management-plan.md). */
  folderId?: string | null;
};
