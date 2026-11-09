import { unstable_rethrow } from "next/navigation";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { uploadFile, uploadClientFile, uploadTaskFile, uploadNewFileVersion } from "@/lib/actions/files";
import { uploadWorkTaskFileAction } from "@/lib/actions/work";
import { uploadInvoiceAttachment } from "@/lib/actions/invoice-attachments";
import { uploadPayrollAttachment } from "@/lib/actions/payroll-attachments";
import { createCorrespondenceAction, updateCorrespondenceAction } from "@/lib/actions/correspondence";
import { UPLOAD_TARGETS, type UploadTarget } from "@/lib/upload-targets";

// File uploads that show a progress bar (see src/lib/upload-targets.ts). Each
// target runs the same Server Action function the UI used to call directly,
// so auth, access checks, virus scanning and audit logging are unchanged.
// revalidatePath() inside them only marks pages stale here; the browser calls
// router.refresh() itself after a successful upload.
const handlers: Record<UploadTarget, (id: string, form: FormData) => Promise<ActionResult<unknown>>> = {
  application: uploadFile,
  client: uploadClientFile,
  task: uploadTaskFile,
  fileVersion: uploadNewFileVersion,
  workTask: uploadWorkTaskFileAction,
  invoice: (id, form) => toActionResult(() => uploadInvoiceAttachment(id, form)),
  payroll: uploadPayrollAttachment,
  correspondenceNew: (_id, form) => createCorrespondenceAction(form),
  correspondence: updateCorrespondenceAction,
};

function json(body: unknown, status = 200) {
  // BigInt (file generations) has no JSON form; none of these results need
  // one back, but a stray one shouldn't crash the response.
  return new Response(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Server Actions reject cross-site calls by comparing Origin with Host; this
// route takes the same cookies, so it does the same.
function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ ok: false, error: "Not permitted" }, 403);

  const params = new URL(request.url).searchParams;
  const target = params.get("target") as UploadTarget | null;
  const id = params.get("id") ?? "";
  if (!target || !UPLOAD_TARGETS.includes(target)) return json({ ok: false, error: "Unknown upload" }, 400);

  try {
    const form = await request.formData();
    return json(await handlers[target](id, form));
  } catch (error) {
    // Lets redirect()/notFound() from the auth checks behave as usual.
    unstable_rethrow(error);
    console.error(`[uploads] ${target} upload failed:`, error);
    return json({ ok: false, error: "Upload failed. Please try again." }, 500);
  }
}
