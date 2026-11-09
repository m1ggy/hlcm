import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { exportResponse, parseExportFormat } from "@/lib/report-export";
import { formatAnswer, isLayoutField, type FieldSnapshot } from "@/lib/form-logic";

// Form submissions as a spreadsheet (docs/forms-plan.md, Phase 4):
// ?form=<id>&status=PENDING|REVIEWED|DISMISSED&format=csv|xlsx (csv default).
// One column per question; a question that's since been removed still gets
// its column from the submissions that answered it.
const STATUS_LABEL: Record<string, string> = { PENDING: "New", REVIEWED: "Reviewed", DISMISSED: "Dismissed" };

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN", "MANAGER", "STAFF"]);
    const params = new URL(request.url).searchParams;
    const format = parseExportFormat(params.get("format") ?? "csv");
    if (!format) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const formId = params.get("form");
    const status = params.get("status");

    const rows = await db.formSubmission.findMany({
      where: { ...(formId && { templateId: formId }), ...(status && ["PENDING", "REVIEWED", "DISMISSED"].includes(status) && { status: status as "PENDING" }) },
      include: { template: { select: { name: true, fields: { orderBy: { sortOrder: "asc" }, select: { key: true, label: true, type: true } } } }, client: { select: { name: true } }, files: { select: { fileName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10_000,
    });

    // Columns: every question seen, in form order, then any older ones.
    const columns = new Map<string, string>();
    for (const r of rows) {
      const snap = (Array.isArray(r.fieldsSnapshot) ? (r.fieldsSnapshot as FieldSnapshot[]) : r.template.fields).filter((f) => !isLayoutField(f.type) && f.type !== "FILE");
      for (const f of snap) if (!columns.has(f.key)) columns.set(f.key, f.label);
    }
    const keys = [...columns.keys()];
    const formName = formId && rows[0] ? rows[0].template.name : "All forms";

    return exportResponse(
      {
        title: `Form submissions — ${formName}`,
        sections: [
          {
            title: "Submissions",
            columns: [
              { label: "Submitted", width: 18 },
              ...(formId ? [] : [{ label: "Form", width: 22 }]),
              { label: "Status", width: 10 },
              ...keys.map((k) => ({ label: columns.get(k)!, width: 24 })),
              { label: "Files", width: 24 },
              { label: "Client", width: 20 },
              { label: "Team note", width: 30 },
            ],
            rows: rows.map((r) => {
              const answers = (r.answers ?? {}) as Record<string, unknown>;
              return [
                r.createdAt.toISOString().replace("T", " ").slice(0, 16),
                ...(formId ? [] : [r.template.name]),
                STATUS_LABEL[r.status] ?? r.status,
                ...keys.map((k) => formatAnswer(answers[k])),
                r.files.map((f) => f.fileName).join(", "),
                r.client?.name ?? "",
                r.note ?? "",
              ];
            }),
          },
        ],
      },
      format,
      `form-submissions${formId ? `-${formName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
