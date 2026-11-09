// The uploads that go through POST /api/uploads (src/app/api/uploads/route.ts)
// instead of calling their Server Action directly. A Server Action call can't
// report upload progress, so these are sent with XMLHttpRequest from
// useUpload() (src/components/files/use-upload.ts), and the route runs the
// very same action. Type-only imports: this file is safe in client bundles.
import type { ActionResult } from "@/lib/action-result";
import type { uploadFile, uploadClientFile, uploadTaskFile, uploadNewFileVersion } from "@/lib/actions/files";
import type { uploadWorkTaskFileAction } from "@/lib/actions/work";
import type { uploadInvoiceAttachment } from "@/lib/actions/invoice-attachments";
import type { uploadPayrollAttachment } from "@/lib/actions/payroll-attachments";
import type { createCorrespondenceAction, updateCorrespondenceAction } from "@/lib/actions/correspondence";

export type UploadResults = {
  /** id = applicationId */
  application: Awaited<ReturnType<typeof uploadFile>>;
  /** id = clientId */
  client: Awaited<ReturnType<typeof uploadClientFile>>;
  /** id = taskId */
  task: Awaited<ReturnType<typeof uploadTaskFile>>;
  /** id = fileAssetId */
  fileVersion: Awaited<ReturnType<typeof uploadNewFileVersion>>;
  /** id = workTaskId */
  workTask: Awaited<ReturnType<typeof uploadWorkTaskFileAction>>;
  /** id = invoiceId */
  invoice: ActionResult<Awaited<ReturnType<typeof uploadInvoiceAttachment>>>;
  /** id = payrollPaymentId */
  payroll: Awaited<ReturnType<typeof uploadPayrollAttachment>>;
  /** id unused — the parent is in the form */
  correspondenceNew: Awaited<ReturnType<typeof createCorrespondenceAction>>;
  /** id = correspondenceId */
  correspondence: Awaited<ReturnType<typeof updateCorrespondenceAction>>;
};

export type UploadTarget = keyof UploadResults;

export const UPLOAD_TARGETS: readonly UploadTarget[] = [
  "application",
  "client",
  "task",
  "fileVersion",
  "workTask",
  "invoice",
  "payroll",
  "correspondenceNew",
  "correspondence",
];
