import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, CreditCard, FileText, Layers } from "lucide-react";
import { auth } from "@/auth";
import { isAdmin, isManagement, canAccessInvoices } from "@/lib/rbac";
import { getClient, archiveClient, restoreClient } from "@/lib/actions/clients";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listClientNotes } from "@/lib/actions/notes";
import { listMcoCredentialsForClient, listReachableMcoStages } from "@/lib/actions/mco";
import { listClientCredentials } from "@/lib/actions/client-credentials";
import { listClientContacts } from "@/lib/actions/client-contacts";
import { listClientOwners } from "@/lib/actions/client-owners";
import { listClientFiles } from "@/lib/actions/files";
import { listClientAgreements } from "@/lib/actions/client-agreements";
import { listClientLicenses } from "@/lib/actions/client-licenses";
import { listCareRecipients, listCaregivers } from "@/lib/actions/care-recipients";
import { listPipelineStages } from "@/lib/actions/stage";
import { listInvoices } from "@/lib/actions/invoices";
import { listInvoiceProfiles } from "@/lib/invoice-profiles";
import { listClientGroups } from "@/lib/actions/client-groups";
import { getClientActivity, listClientServices } from "@/lib/actions/client-services";
import { listClientAdjustments } from "@/lib/actions/service-adjustments";
import { listClientServiceTasks } from "@/lib/actions/tasks";
import { listServiceTypes } from "@/lib/actions/projects";
import { summarizeByService } from "@/lib/service-financials";
import { formatMoney } from "@/lib/time-entries";
import { displayInvoiceNumber, formatShortCalendarDate } from "@/lib/invoice-format";
import { InvoiceStatusBadge, isInvoiceOverdue } from "@/components/invoices/invoice-status-badge";
import { ClientNotesPanel } from "@/components/clients/client-notes-panel";
import { McoCredentialsCard } from "@/components/clients/mco-credentials-card";
import { ClientCredentialsCard } from "@/components/clients/client-credentials-card";
import { ClientContactsCard } from "@/components/clients/client-contacts-card";
import { ClientOwnersCard } from "@/components/clients/client-owners-card";
import { ClientFilePool } from "@/components/clients/client-file-pool";
import { ClientAgreementsCard } from "@/components/clients/client-agreements-card";
import { ClientLicensesCard } from "@/components/clients/client-licenses-card";
import { CareRecipientsCard } from "@/components/clients/care-recipients-card";
import { ClientServicesCard } from "@/components/clients/client-services-card";
import { ClientHeader } from "@/components/clients/client-header";
import { EditClientSheet } from "@/components/clients/edit-client-sheet";
import { ServiceFormDialog } from "@/components/clients/service-form-dialog";
import { ServiceTasksCard, type ServiceTask } from "@/components/clients/service-tasks-card";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { MoreMenu } from "@/components/shared/more-menu";
import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { CaregiverClientProfile } from "@/components/clients/caregiver-client-profile";

// ?tab= picks the opening tab, so other pages (and the Overview's own
// "View all" links) can deep-link into one.
const TABS = ["overview", "services", "tasks", "licensing", "accounting", "documents", "activity"] as const;

// Client profile (PDF screens 1–3): one record per client, its services
// and their combined money/activity, with every existing client section
// (cases, care recipients, licenses, credentials, …) kept in its tabs.
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  // A Caregiver's client profile is a much narrower, read-only view (own
  // tasks only, no billing/credentials/audit log) — routed to its own
  // component rather than threading role checks through the page below,
  // which is all ADMIN/MANAGER/STAFF territory.
  const earlySession = await auth();
  if (earlySession?.user?.role === "CAREGIVER") {
    return <CaregiverClientProfile clientId={id} />;
  }

  let client;
  try {
    client = await getClient(id);
  } catch {
    notFound();
  }

  const session = await auth();
  // listInvoices is ACCOUNTANT/OWNER only (unlike getClient itself, which
  // STAFF can also reach) — gate the fetch, not just the display, so a
  // viewer without invoice access never triggers a ForbiddenError just for
  // loading this page. Archiving the client itself is a separate,
  // broader ADMIN/MANAGER permission, not tied to invoice access.
  const canManageInvoices = canAccessInvoices(session?.user?.role);
  const canArchive = isManagement(session?.user?.role);
  const isUserAdmin = isAdmin(session?.user?.role);
  // "cases" was this tab's name before it became Licensing — old links still land there.
  const requestedTab = TABS.find((t) => t === (tab === "cases" ? "licensing" : tab)) ?? "overview";
  const initialTab = requestedTab === "accounting" && !canManageInvoices ? "overview" : requestedTab;

  const [
    assignableUsers,
    notes,
    activity,
    mcoCredentials,
    credentials,
    contacts,
    owners,
    files,
    agreements,
    licenses,
    mcoStages,
    invoices,
    invoiceProfiles,
    clientGroups,
    careRecipients,
    caregivers,
    services,
    serviceTypes,
    adjustments,
    tasks,
  ] = await Promise.all([
    listAssignableUsers(),
    listClientNotes(id),
    getClientActivity(id, { includeInvoices: canManageInvoices }),
    listMcoCredentialsForClient(id),
    listClientCredentials(id),
    listClientContacts(id),
    listClientOwners(id),
    listClientFiles(id),
    listClientAgreements(id),
    listClientLicenses(id),
    listPipelineStages("MCO", { includeExit: true }),
    canManageInvoices ? listInvoices({ clientId: id }) : Promise.resolve([]),
    canManageInvoices ? listInvoiceProfiles() : Promise.resolve([]),
    listClientGroups(),
    listCareRecipients({ clientId: id }),
    listCaregivers(),
    listClientServices(id, { includeArchived: true }),
    listServiceTypes(),
    canManageInvoices ? listClientAdjustments(id) : Promise.resolve([]),
    listClientServiceTasks(id),
  ]);
  const mcoCredentialsWithStages = await Promise.all(
    mcoCredentials.map(async (c) => ({ ...c, reachableStages: await listReachableMcoStages(c.id) }))
  );

  // Client totals are always the sum of its invoices and adjustments,
  // grouped by service — never stored (src/lib/service-financials.ts). Null
  // for anyone without invoice access, which hides every money figure below.
  const summary = canManageInvoices ? summarizeByService(invoices, services.map((s) => s.id), adjustments) : null;
  const money = summary && {
    byService: Object.fromEntries(summary.byService),
    general: summary.general,
    total: summary.total,
  };
  const activeServices = services.filter((s) => s.active);
  const users = assignableUsers.map((u) => ({ id: u.id, name: u.name }));
  const serviceTypeOptions = serviceTypes.map((t) => ({ id: t.id, name: t.name }));
  const auditLookups = {
    users: Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])),
    clientGroups: Object.fromEntries(clientGroups.map((g) => [g.id, g.name])),
    services: Object.fromEntries(services.map((s) => [s.id, s.name])),
    serviceTypes: Object.fromEntries(serviceTypes.map((t) => [t.id, t.name])),
  };
  const primaryContact = owners[0] ?? contacts[0] ?? null;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{client.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ClientHeader
        client={client}
        projects={client.projects}
        primaryContact={primaryContact}
        actions={
          <>
            <ServiceFormDialog
              clientId={id}
              serviceTypes={serviceTypeOptions}
              users={users}
              triggerKind="add"
            />
            <EditClientSheet
              clientId={id}
              groups={clientGroups.map((g) => ({ id: g.id, name: g.name }))}
              defaultValues={{
                name: client.name,
                contactInfo: client.contactInfo,
                address: client.address,
                businessName: client.businessName,
                businessPhone: client.businessPhone,
                businessEmail: client.businessEmail,
                status: client.status,
                billingAddressLine1: client.billingAddressLine1,
                billingCity: client.billingCity,
                billingState: client.billingState,
                billingPostalCode: client.billingPostalCode,
                billingCountry: client.billingCountry,
                clientGroupId: client.clientGroupId,
              }}
            />
            <MoreMenu
              exportHref={`/api/export/clients/${id}`}
              archive={
                canArchive
                  ? {
                      archived: !client.active,
                      label: client.name,
                      action: client.active ? archiveClient.bind(null, id) : restoreClient.bind(null, id),
                    }
                  : undefined
              }
            />
          </>
        }
      />

      <Tabs defaultValue={initialTab}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="licensing">Licensing</TabsTrigger>
          {canManageInvoices && <TabsTrigger value="accounting">Accounting</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total Services" value={String(activeServices.length)} icon={Layers} tone="blue" />
            {money && (
              <>
                <StatTile label="Total Invoiced" value={formatMoney(money.total.invoiced)} icon={FileText} tone="green" />
                <StatTile label="Total Received" value={formatMoney(money.total.received)} icon={CreditCard} tone="purple" />
                <StatTile label="Total Outstanding" value={formatMoney(money.total.outstanding)} icon={BarChart3} tone="red" />
              </>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <ClientServicesCard
                clientId={id}
                services={services}
                serviceTypes={serviceTypeOptions}
                users={users}
                money={money}
                canArchive={canArchive}
                variant="summary"
              />
            </div>
            <Card className="xl:col-span-2">
              <CardContent>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-medium">Recent Activity</h2>
                  <Link href={`/clients/${id}?tab=activity`} className="text-sm font-medium text-primary hover:underline">
                    View All
                  </Link>
                </div>
                <ActivityFeed entries={activity.slice(0, 5)} lookups={auditLookups} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ClientOwnersCard clientId={id} owners={owners} />
            <ClientContactsCard clientId={id} contacts={contacts} />
          </div>

          <CareRecipientsCard
            clientId={id}
            recipients={careRecipients}
            caregivers={caregivers}
            profiles={invoiceProfiles.map((p) => ({ id: p.id, name: p.name }))}
            canManageInvoices={canManageInvoices}
            isAdmin={isUserAdmin}
          />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ClientServicesCard
            clientId={id}
            services={services}
            serviceTypes={serviceTypeOptions}
            users={users}
            money={money}
            canArchive={canArchive}
          />
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <ServiceTasksCard
            clientId={id}
            services={activeServices.map((s) => ({ id: s.id, name: s.name }))}
            tasks={tasks as ServiceTask[]}
            assignableUsers={users}
            currentUserId={session!.user.id}
            isAdmin={isUserAdmin}
          />
        </TabsContent>

        <TabsContent value="licensing" className="space-y-6 pt-4">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-medium">Cases ({client.applications.length})</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.applications.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        No cases for this client yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {client.applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        <Link href={`/applications/${app.id}`} className="text-primary hover:underline">
                          {app.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {app.stage ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: app.stage.hex, color: "#fff" }}
                            title={app.stage.name}
                          >
                            {app.stage.abbrev}
                          </span>
                        ) : (
                          <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                            {STATUS_LABELS[app.status as ApplicationStatus]}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <ClientLicensesCard clientId={id} licenses={licenses} />

          <McoCredentialsCard clientId={id} credentials={mcoCredentialsWithStages} mcoStages={mcoStages} />

          <ClientAgreementsCard clientId={id} agreements={agreements} />
        </TabsContent>

        {canManageInvoices && money && (
          <TabsContent value="accounting" className="space-y-6 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Total Invoiced" value={formatMoney(money.total.invoiced)} icon={FileText} tone="green" />
              <StatTile label="Total Received" value={formatMoney(money.total.received)} icon={CreditCard} tone="purple" />
              <StatTile label="Total Outstanding" value={formatMoney(money.total.outstanding)} icon={BarChart3} tone="red" />
            </div>
            <Card>
              <CardContent>
                <h2 className="mb-3 text-base font-medium">Invoices ({invoices.length})</h2>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Invoice Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No invoices for this client yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium tabular-nums">
                            <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">
                              {displayInvoiceNumber(invoice)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {invoice.clientService ? (
                              <Link
                                href={`/clients/${id}/services/${invoice.clientService.id}?tab=accounting`}
                                className="hover:underline"
                              >
                                {invoice.clientService.name}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">General</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {formatShortCalendarDate(invoice.issueDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {invoice.dueDate ? formatShortCalendarDate(invoice.dueDate) : "—"}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={isInvoiceOverdue(invoice) ? "OVERDUE" : invoice.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {invoice.total != null ? formatMoney(invoice.total) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="documents" className="space-y-6 pt-4">
          <ClientFilePool clientId={id} files={files} canEdit />

          <ClientCredentialsCard clientId={id} credentials={credentials} />
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <Card>
            <CardContent>
              <Tabs defaultValue="audit">
                <TabsList>
                  <TabsTrigger value="audit">Activity</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>
                <TabsContent value="audit">
                  <div className="max-h-[40rem] overflow-y-auto pr-1">
                    <AuditLogPanel auditLog={activity} {...auditLookups} />
                  </div>
                </TabsContent>
                <TabsContent value="notes">
                  <ClientNotesPanel clientId={id} notes={notes} mentionableUsers={assignableUsers} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
