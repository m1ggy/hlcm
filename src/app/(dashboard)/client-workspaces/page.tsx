import Link from "next/link";
import { notFound } from "next/navigation";
import { blockCaregiverRoute, requireSession } from "@/lib/rbac";
import { listAssignableStaff, listAssignments, listClientPeople, listEveningTexts, listManagedWorkspaces } from "@/lib/workspace-assignments";
import { ClientTextSignups } from "@/components/workspaces/client-text-signups";
import { switchingAvailable } from "@/lib/workspace-switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { AssignStaffDialog } from "@/components/workspaces/assign-staff-dialog";
import { RemoveAssignmentButton } from "@/components/workspaces/remove-assignment-button";

const formatDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const formatDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const formatTime = (d: Date, timeZone: string | null) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(timeZone ? { timeZone } : {}) });

// The managing company's side of docs/workspace-tasks-plan.md, Phase 1:
// which of its people work in which client workspace. Admins see every
// workspace it manages; account managers only theirs, and add staff only.
export default async function ClientWorkspacesPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await blockCaregiverRoute();
  const session = await requireSession();
  const actor = { userId: session.user.id, orgId: session.user.organizationId, role: session.user.role, name: session.user.name };
  const workspaces = await listManagedWorkspaces(actor);
  if (workspaces.length === 0) notFound();

  const { w } = await searchParams;
  const selected = workspaces.find((x) => x.slug === w) ?? workspaces[0];
  const [assignments, staff, clientPeople, evening] = await Promise.all([
    listAssignments(actor, selected.id),
    listAssignableStaff(actor),
    selected.kind === "TASKS" ? listClientPeople(actor, selected.id) : null,
    selected.kind === "TASKS" ? listEveningTexts(actor, selected.id) : null,
  ]);
  const active = assignments.filter((a) => a.active);
  const ended = assignments.filter((a) => !a.active);
  const assignedIds = new Set(active.map((a) => a.homeUserId));
  const isAdmin = selected.level === "admin";
  const eveningTexts = evening?.texts ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Client workspaces</h1>
        <PageInfoButton title="Client workspaces">
          <p>Each client company has its own workspace. Assign your people to it so they can work on its projects and tasks.</p>
          <p>
            Assigned people switch between workspaces from the menu at the top of the sidebar — one sign-in, no extra
            passwords. The client can see who is assigned but can&apos;t remove them.
          </p>
          <p>Account managers can add and remove staff for the workspaces they manage. Only admins add managers.</p>
        </PageInfoButton>
      </div>
      {!switchingAvailable() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Assignments are saved, but switching into client workspaces starts once workspace addresses are turned on.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <nav className="space-y-1">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/client-workspaces?w=${ws.slug}`}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted ${ws.id === selected.id ? "bg-muted font-medium" : ""}`}
            >
              <span className="truncate">{ws.name}</span>
              <span className="flex items-center gap-1.5">
                {ws.status === "SUSPENDED" && <Badge variant="outline">Suspended</Badge>}
                <span className="text-xs text-muted-foreground">{ws.assignedCount}</span>
              </span>
            </Link>
          ))}
        </nav>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{selected.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selected.kind === "TASKS" ? "Tasks workspace" : "Full workspace"} · {active.length} assigned
              </p>
            </div>
            <AssignStaffDialog
              orgId={selected.id}
              workspaceName={selected.name}
              canAddManagers={isAdmin}
              staff={staff.filter((s) => !assignedIds.has(s.id))}
            />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role there</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>
                      {a.role === "MANAGER" ? "Manager" : "Staff"}
                      {a.canAssign && (
                        <Badge variant="secondary" className="ml-2">
                          Account manager
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(a.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {(isAdmin || (!a.canAssign && a.role === "STAFF")) && (
                        <RemoveAssignmentButton assignmentId={a.id} name={a.name} workspaceName={selected.name} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {active.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Nobody is assigned yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {ended.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Previously assigned: {ended.map((a) => `${a.name} (until ${a.endedAt ? formatDate(a.endedAt) : "—"})`).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
        {clientPeople && (
          <Card className="min-w-0 md:col-start-2">
            <CardHeader>
              <CardTitle>{selected.name}&apos;s people</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mobile numbers and the evening text update. Sign someone up only after they&apos;ve agreed to get texts.
              </p>
            </CardHeader>
            <CardContent>
              <ClientTextSignups key={selected.id} orgId={selected.id} people={clientPeople.people} dailyTextOn={clientPeople.dailyTextOn} />
            </CardContent>
          </Card>
        )}
        {eveningTexts && (
          <Card className="min-w-0 md:col-start-2">
            <CardHeader>
              <CardTitle>Evening texts sent</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each evening text that went out to {selected.name}&apos;s people, newest first, with who got each one. Shows the last 60.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Text</TableHead>
                    <TableHead>Recipients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eveningTexts.map((t) => (
                    <TableRow key={t.day} className="align-top">
                      <TableCell className="whitespace-nowrap font-medium">{formatDay(t.day)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTime(t.sentAt, evening?.timeZone ?? null)}</TableCell>
                      <TableCell className="max-w-md whitespace-normal text-sm">
                        {t.note || <span className="text-muted-foreground">The day&apos;s headline (no note written)</span>}
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm">
                        {t.recipients.length === 0 ? (
                          <span className="text-muted-foreground">Nobody signed up</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {t.recipients.map((r, i) => (
                              <li key={i}>
                                {r.name ?? "Removed person"} <span className="text-muted-foreground">{r.toNumber}</span>{" "}
                                {r.ok ? (
                                  <Badge variant="secondary">Sent</Badge>
                                ) : (
                                  <Badge variant="destructive" title={r.error ?? undefined}>
                                    Failed
                                  </Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {eveningTexts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No evening texts have gone out yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
