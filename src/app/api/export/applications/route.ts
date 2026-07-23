import { NextResponse } from "next/server";
import { listApplications } from "@/lib/actions/applications";
import { STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const applications = await listApplications();
    const header = ["Name", "Client", "Assigned To", "Status", "Created At"];
    const rows = applications.map((app) => [
      app.name,
      app.client.name,
      app.assignedUser.name,
      STATUS_LABELS[app.status as ApplicationStatus],
      new Date(app.createdAt).toLocaleDateString(),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="applications.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
