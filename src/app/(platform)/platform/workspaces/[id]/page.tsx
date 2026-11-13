import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOrganizationDetailForPlatform, listOrganizationsForPlatform, platformAdminHasMfa } from "@/lib/actions/platform";
import { WorkspaceActions } from "@/components/platform/platform-organizations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// One workspace on the platform console: who it is, who's in it, how much
// it holds and what's happened to it. Account metadata, counts and audit
// actions only — never its clients', cases' or invoices' contents.

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  MANAGER: "Manager",
  STAFF: "Staff",
  CAREGIVER: "Caregiver",
  CLIENT: "Client",
  DEVELOPER: "Developer",
};

function formatDate(date: Date | string | null) {
  return date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function formatDateTime(date: Date | string | null) {
  return date
    ? new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// "invite_owner" -> "Invite owner"
function humanize(action: string) {
  const words = action.replace(/[_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const INVITE_BADGE = {
  PENDING: <Badge variant="outline">Invite pending</Badge>,
  ACCEPTED: <Badge variant="secondary">Joined</Badge>,
  NONE: <span className="text-xs text-muted-foreground">Temporary password</span>,
};

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await platformAdminHasMfa())) redirect("/platform");
  const { id } = await params;
  const [org, organizations] = await Promise.all([getOrganizationDetailForPlatform(id), listOrganizationsForPlatform()]);
  if (!org) notFound();
  const listed = organizations.find((o) => o.id === org.id);
  const suspended = org.status === "SUSPENDED";
  const activeUsers = org.users.filter((u) => u.active);
  const owners = activeUsers.filter((u) => u.role === "OWNER");
  const storageTotal = org.storage.files + org.storage.invoiceAttachments + org.storage.formUploads;
  const settingsOn = [
    org.settings.workAiSummaries && "AI daily/weekly notes",
    org.settings.workWeeklyEmail && "Monday email to client",
    org.settings.workDailyText && "Evening text",
    org.settings.workShowHoursToClient && "Hours shown to client",
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <Link href="/platform" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-3.5" /> All workspaces
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{org.name}</h1>
              {suspended ? <Badge variant="outline">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}
              <Badge variant="outline">{org.kind === "TASKS" ? "Tasks only" : "Full CRM"}</Badge>
            </div>
            <a href={org.url} target="_blank" rel="noreferrer" className="font-mono text-sm text-muted-foreground underline">
              {org.url.replace(/^https?:\/\//, "")}
            </a>
          </div>
          {listed && (
            <div className="flex flex-wrap gap-1">
              <WorkspaceActions org={listed} organizations={organizations} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Name">{org.name}</Field>
              <Field label="Address">
                <span className="font-mono">{org.slug}</span>
              </Field>
              <Field label="Type">{org.kind === "TASKS" ? "Tasks only (client company)" : "Full (licensing CRM)"}</Field>
              <Field label="Created">{formatDate(org.createdAt)}</Field>
              <Field label="Last active">{formatDateTime(org.lastActivityAt)}</Field>
              <Field label="Settings changed">{formatDate(org.updatedAt)}</Field>
              <Field label="Timezone">{org.timezone ?? "Server default"}</Field>
              <Field label="Reply-to email">{org.replyToEmail ?? "—"}</Field>
              <Field label="Managed by">
                {org.managedByOrgId ? (
                  <Link href={`/platform/workspaces/${org.managedByOrgId}`} className="underline">
                    {org.managedByName}
                  </Link>
                ) : (
                  "Nobody"
                )}
              </Field>
              <Field label="Terms">
                {org.termsVersion ? `${org.termsVersion}, accepted ${formatDate(org.termsAcceptedAt)}` : "Not accepted yet"}
              </Field>
              <Field label="Accepted by">{org.termsAcceptedBy ?? "—"}</Field>
              <Field label="Setup checklist">{org.setupChecklistDismissedAt ? `Dismissed ${formatDate(org.setupChecklistDismissedAt)}` : "Still showing"}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Owners</div>
              {owners.length ? (
                <ul className="space-y-0.5">
                  {owners.map((o) => (
                    <li key={o.id} className="truncate">
                      {o.name} <span className="text-muted-foreground">· {o.email}</span>
                      {o.invite === "PENDING" && <span className="text-xs text-amber-600 dark:text-amber-400"> · hasn&apos;t joined</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-600 dark:text-amber-400">No active owner — use Invite owner.</p>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Integrations</div>
              {org.integrations.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {org.integrations.map((i) => (
                    <Badge key={i.provider} variant="secondary" title={`Connected ${formatDate(i.connectedAt)}`}>
                      {humanize(i.provider.toLowerCase())}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">None connected</p>
              )}
            </div>
            {org.kind === "TASKS" && (
              <div>
                <div className="text-xs text-muted-foreground">Client updates</div>
                <p>{settingsOn.length ? settingsOn.join(" · ") : "All off"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active users" value={activeUsers.length} />
        <Stat label="Assigned staff" value={org.assigned.filter((a) => a.active).length} />
        {org.kind === "FULL" ? (
          <>
            <Stat label="Clients" value={org.counts.clients} />
            <Stat label="Cases" value={org.counts.applications} />
            <Stat label="Leads" value={org.counts.leads} />
            <Stat label="Care recipients" value={org.counts.careRecipients} />
            <Stat label="Invoices" value={org.counts.invoices} />
            <Stat label="Projects" value={org.counts.projects} />
            <Stat label="Form submissions" value={org.counts.formSubmissions} />
          </>
        ) : null}
        <Stat label="Work projects" value={org.counts.workProjects} />
        <Stat label="Open work tasks" value={org.counts.openWorkTasks} />
        <Stat label="EOD reports" value={org.counts.eodReports} />
        <Stat label="Files stored" value={formatBytes(storageTotal)} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Storage: {formatBytes(org.storage.files)} documents · {formatBytes(org.storage.invoiceAttachments)} invoice attachments ·{" "}
        {formatBytes(org.storage.formUploads)} form uploads
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Users ({org.users.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invite</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.users.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                  <TableCell>{u.active ? "Active" : <Badge variant="outline">Deactivated</Badge>}</TableCell>
                  <TableCell>{INVITE_BADGE[u.invite]}</TableCell>
                  <TableCell>{u.mfaEnabled ? "On" : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(u.lastSignInAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
              {org.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No users.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {org.assigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned from {org.managedByName ?? "the managing company"} ({org.assigned.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Role here</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last opened</TableHead>
                  <TableHead>Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.assigned.map((a) => (
                  <TableRow key={a.id} className={a.active ? undefined : "text-muted-foreground"}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                    </TableCell>
                    <TableCell>{a.homeOrgName}</TableCell>
                    <TableCell>
                      {ROLE_LABELS[a.role] ?? a.role}
                      {a.canAssign && <span className="text-muted-foreground"> · account manager</span>}
                    </TableCell>
                    <TableCell>{a.active ? "Active" : <Badge variant="outline">Ended</Badge>}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(a.lastSignInAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(a.since)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {org.managedWorkspaces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Workspaces it manages ({org.managedWorkspaces.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {org.managedWorkspaces.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/platform/workspaces/${w.id}`} className="font-medium hover:underline">
                    {w.name} <span className="font-mono text-xs text-muted-foreground">{w.slug}</span>
                  </Link>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {w.assignedCount} assigned{w.status === "SUSPENDED" && " · suspended"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent sign-ins</CardTitle>
          </CardHeader>
          <CardContent>
            {org.recentSignIns.length ? (
              <ul className="divide-y text-sm">
                {org.recentSignIns.map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate">
                        {e.userName}
                        {!e.success && (
                          <span className="text-destructive"> · failed{e.reason ? ` (${humanize(e.reason).toLowerCase()})` : ""}</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[humanize(e.deviceType.toLowerCase()), e.browser, e.os, e.ipAddress].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nobody has signed in yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {org.recentActivity.length ? (
              <ul className="divide-y text-sm">
                {org.recentActivity.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0 truncate">
                      {a.actorName} <span className="text-muted-foreground">· {humanize(a.action).toLowerCase()} {a.entityType}</span>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Console history</CardTitle>
        </CardHeader>
        <CardContent>
          {org.consoleHistory.length ? (
            <ul className="divide-y text-sm">
              {org.consoleHistory.map((h, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0 truncate">
                    {humanize(h.action)}
                    {h.newValue && <span className="text-muted-foreground"> · {h.newValue}</span>}
                    <span className="text-muted-foreground"> · by {h.actorName}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing done from the console yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
