import type { ExportColumn, ExportDoc, ExportSection } from "@/lib/report-export";
import type { ServiceMoney } from "@/lib/service-financials";
import { invoiceMoney } from "@/lib/service-financials";
import { SERVICE_STATUS_LABELS, type ServiceStatus } from "@/lib/service-status";
import { CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/client-status";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, type TaskStatusValue, type TaskPriorityValue } from "@/lib/task-status";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import { formatMoney } from "@/lib/time-entries";
import type { getClientStatement, getClientsInvoiceSummary, getServiceStatement, runServiceReport } from "@/lib/actions/reports";

// Turns report data (src/lib/actions/reports.ts) into the ExportDoc every
// export format renders from. Money columns are left out entirely when the
// viewer can't see money, never shown as zeros.

const MONEY_COLUMNS: ExportColumn[] = [
  { label: "Invoiced", kind: "money" },
  { label: "Received", kind: "money" },
  { label: "Adjustments", kind: "money" },
  { label: "Outstanding", kind: "money" },
];

const moneyCells = (m: ServiceMoney | null) => (m ? [m.invoiced, m.received, m.adjustments, m.outstanding] : []);

function sumMoney(rows: (ServiceMoney | null)[]): ServiceMoney {
  const total = { invoiced: 0, received: 0, adjustments: 0, outstanding: 0, invoiceCount: 0 };
  for (const m of rows) {
    if (!m) continue;
    total.invoiced += m.invoiced;
    total.received += m.received;
    total.adjustments += m.adjustments;
    total.outstanding += m.outstanding;
    total.invoiceCount += m.invoiceCount;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { ...total, invoiced: r(total.invoiced), received: r(total.received), adjustments: r(total.adjustments), outstanding: r(total.outstanding) };
}

function taskSection(
  tasks: {
    label: string;
    status: string;
    priority: string | null;
    dueDate: Date | null;
    assignees: { user: { name: string } }[];
    clientService?: { name: string } | null;
  }[],
  withService: boolean
): ExportSection {
  return {
    title: "Tasks",
    columns: [
      { label: "Task", width: 3 },
      ...(withService ? [{ label: "Service" }] : []),
      { label: "Assigned to" },
      { label: "Due", kind: "date" as const },
      { label: "Status" },
      { label: "Priority" },
    ],
    rows: tasks.map((t) => [
      t.label,
      ...(withService ? [t.clientService?.name ?? ""] : []),
      t.assignees.map((a) => a.user.name).join(", "),
      t.dueDate,
      TASK_STATUS_LABELS[t.status as TaskStatusValue] ?? t.status,
      t.priority ? TASK_PRIORITY_LABELS[t.priority as TaskPriorityValue] : "",
    ]),
  };
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

type InvoiceForListing = {
  seq: number;
  stripeInvoiceNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  total: number | null;
  amountPaid: number | null;
  issueDate: Date | null;
  dueDate: Date | null;
  clientService: { name: string } | null;
  invoiceProfile: { name: string } | null;
  payments: { paidAt: Date; paymentMethod: string; amount: number }[];
  client?: { name: string };
};

// Every billed invoice, then every recorded payment against them — the
// client export (one client) and the Clients list export (many; adds a
// Client column). Stripe-paid invoices have no Payment rows, so they show
// as paid in the invoice list but don't appear under Payments.
function invoiceAndPaymentSections(invoices: InvoiceForListing[], withClient: boolean): ExportSection[] {
  const clientCol: ExportColumn[] = withClient ? [{ label: "Client", width: 2 }] : [];
  const clientCell = (i: InvoiceForListing) => (withClient ? [i.client?.name ?? ""] : []);
  const invoiceTotals = sumMoney(invoices.map((i) => invoiceMoney(i)));
  const payments = invoices.flatMap((i) => i.payments.map((p) => ({ invoice: i, payment: p })));
  const paymentTotal = Math.round(payments.reduce((sum, { payment }) => sum + payment.amount, 0) * 100) / 100;
  const blanks = (n: number) => Array<null>(n).fill(null);
  return [
    {
      title: "Invoices",
      columns: [
        ...clientCol,
        { label: "Invoice #" },
        { label: "Profile" },
        { label: "Service", width: 2 },
        { label: "Issued", kind: "date" },
        { label: "Due", kind: "date" },
        { label: "Status" },
        { label: "Amount", kind: "money" },
        { label: "Received", kind: "money" },
        { label: "Outstanding", kind: "money" },
      ],
      rows: invoices.map((i) => {
        const m = invoiceMoney(i);
        return [
          ...clientCell(i),
          displayInvoiceNumber(i),
          i.invoiceProfile?.name ?? "",
          i.clientService?.name ?? "General",
          i.issueDate,
          i.dueDate,
          INVOICE_STATUS_LABELS[i.status] ?? i.status,
          m.invoiced,
          m.received,
          m.outstanding,
        ];
      }),
      footer: ["Total", ...blanks(clientCol.length + 5), invoiceTotals.invoiced, invoiceTotals.received, invoiceTotals.outstanding],
    },
    {
      title: "Payments",
      columns: [...clientCol, { label: "Invoice #" }, { label: "Date", kind: "date" }, { label: "Method" }, { label: "Amount", kind: "money" }],
      rows: payments.map(({ invoice, payment }) => [
        ...clientCell(invoice),
        displayInvoiceNumber(invoice),
        payment.paidAt,
        payment.paymentMethod,
        payment.amount,
      ]),
      footer: ["Total", ...blanks(clientCol.length + 2), paymentTotal],
    },
  ];
}

export function buildClientsInvoiceSummaryDoc(
  data: Awaited<ReturnType<typeof getClientsInvoiceSummary>>,
  subtitle: string
): ExportDoc {
  const { clientRows, invoices } = data;
  return {
    title: "Clients — invoices & payments",
    subtitle,
    sections: [
      {
        title: "Summary",
        columns: [
          { label: "Client", width: 3 },
          { label: "Status" },
          { label: "Invoices", kind: "number" },
          ...MONEY_COLUMNS,
        ],
        rows: clientRows.map(({ client, money }) => [
          client.name,
          CLIENT_STATUS_LABELS[client.status as ClientStatus] ?? client.status,
          money.invoiceCount,
          ...moneyCells(money),
        ]),
        footer: (() => {
          const t = sumMoney(clientRows.map((r) => r.money));
          return ["Total", "", t.invoiceCount, ...moneyCells(t)];
        })(),
      },
      ...invoiceAndPaymentSections(invoices, true),
    ],
  };
}

export function buildReportDoc(
  level: "client" | "service",
  report: Awaited<ReturnType<typeof runServiceReport>>,
  subtitle: string
): ExportDoc {
  const { showMoney } = report;
  if (level === "client") {
    const rows = report.clientRows;
    return {
      title: "Client report",
      subtitle,
      sections: [
        {
          title: "Clients",
          columns: [{ label: "Client", width: 3 }, { label: "Status" }, { label: "Services", kind: "number" }, ...(showMoney ? MONEY_COLUMNS : [])],
          rows: rows.map((r) => [
            r.clientName,
            CLIENT_STATUS_LABELS[r.clientStatus as ClientStatus] ?? r.clientStatus,
            r.serviceCount,
            ...moneyCells(r.money),
          ]),
          footer: showMoney
            ? ["Total", "", rows.reduce((n, r) => n + r.serviceCount, 0), ...moneyCells(sumMoney(rows.map((r) => r.money)))]
            : undefined,
        },
      ],
    };
  }
  const rows = report.serviceRows;
  return {
    title: "Service report",
    subtitle,
    sections: [
      {
        title: "Services",
        columns: [
          { label: "Client", width: 2 },
          { label: "Service", width: 2 },
          { label: "Type" },
          { label: "Status" },
          { label: "Start", kind: "date" },
          { label: "Renewal/end", kind: "date" },
          { label: "Team", width: 2 },
          { label: "Open tasks", kind: "number" },
          ...(showMoney ? MONEY_COLUMNS : []),
        ],
        rows: rows.map((r) => [
          r.clientName,
          r.serviceName,
          r.serviceType ?? "",
          SERVICE_STATUS_LABELS[r.status],
          r.startDate,
          r.endDate,
          r.team,
          r.openTasks,
          ...moneyCells(r.money),
        ]),
        footer: showMoney
          ? ["Total", "", "", "", null, null, "", rows.reduce((n, r) => n + r.openTasks, 0), ...moneyCells(sumMoney(rows.map((r) => r.money)))]
          : undefined,
      },
    ],
  };
}

export function buildClientStatementDoc(data: Awaited<ReturnType<typeof getClientStatement>>): ExportDoc {
  const { client, showMoney, summary, outstandingInvoices, billedInvoices, tasks } = data;
  const sections: ExportSection[] = [
    {
      title: "Client information",
      columns: [{ label: "Field" }, { label: "Value", width: 4 }],
      rows: [
        ["Client ID", client.id],
        ["Name", client.name],
        ["Business name", client.businessName ?? ""],
        ["Status", CLIENT_STATUS_LABELS[client.status as ClientStatus] ?? client.status],
        ["Email", client.businessEmail ?? ""],
        ["Phone", client.businessPhone ?? ""],
        ["Address", client.address ?? ""],
      ],
    },
    {
      title: "Services",
      columns: [
        { label: "Service", width: 2 },
        { label: "Type" },
        { label: "Status" },
        { label: "Start", kind: "date" },
        { label: "Renewal/end", kind: "date" },
        ...(showMoney ? MONEY_COLUMNS : []),
      ],
      rows: [
        ...client.services.map((s) => [
          s.name,
          s.serviceType?.name ?? "",
          SERVICE_STATUS_LABELS[s.status as ServiceStatus],
          s.startDate,
          s.endDate,
          ...moneyCells(summary?.byService.get(s.id) ?? null),
        ]),
        ...(summary && summary.general.invoiceCount > 0
          ? [["General (no service)", "", "", null, null, ...moneyCells(summary.general)]]
          : []),
      ],
      footer: summary ? ["Total", "", "", null, null, ...moneyCells(summary.total)] : undefined,
    },
  ];
  if (showMoney) {
    sections.push({
      title: "Outstanding invoices",
      columns: [
        { label: "Invoice #" },
        { label: "Service", width: 2 },
        { label: "Issued", kind: "date" },
        { label: "Due", kind: "date" },
        { label: "Amount", kind: "money" },
        { label: "Outstanding", kind: "money" },
      ],
      rows: outstandingInvoices.map((i) => [
        displayInvoiceNumber(i),
        i.clientService?.name ?? "General",
        i.issueDate,
        i.dueDate,
        i.total ?? 0,
        invoiceMoney(i).outstanding,
      ]),
    });
    sections.push(...invoiceAndPaymentSections(billedInvoices, false));
  }
  sections.push(taskSection(tasks, true));
  return { title: `${client.name} — client report`, sections };
}

export function buildServiceStatementDoc(data: Awaited<ReturnType<typeof getServiceStatement>>): ExportDoc {
  const { service, showMoney, money, invoices, adjustments, tasks } = data;
  const sections: ExportSection[] = [
    {
      title: "Service details",
      columns: [{ label: "Field" }, { label: "Value", width: 4 }],
      rows: [
        ["Service ID", service.id],
        ["Client", service.client.name],
        ["Service", service.name],
        ["Type", service.serviceType?.name ?? ""],
        ["Status", SERVICE_STATUS_LABELS[service.status as ServiceStatus]],
        ["Start date", service.startDate],
        ["Renewal/end date", service.endDate],
        ["Assigned team", service.team.map((t) => t.user.name).join(", ")],
        ["Fee", service.feeAmount != null ? `${formatMoney(service.feeAmount)} ${service.feeFrequency ?? ""}`.trim() : ""],
        ...(money
          ? [
              ["Total invoiced", formatMoney(money.invoiced)],
              ["Total received", formatMoney(money.received)],
              ["Adjustments", formatMoney(money.adjustments)],
              ["Outstanding", formatMoney(money.outstanding)],
            ]
          : []),
      ],
    },
  ];
  if (showMoney) {
    sections.push(
      {
        title: "Invoices",
        columns: [
          { label: "Invoice #" },
          { label: "Issued", kind: "date" },
          { label: "Due", kind: "date" },
          { label: "Status" },
          { label: "Amount", kind: "money" },
          { label: "Outstanding", kind: "money" },
        ],
        rows: invoices.map((i) => [
          displayInvoiceNumber(i),
          i.issueDate,
          i.dueDate,
          i.status,
          i.total ?? 0,
          invoiceMoney(i).outstanding,
        ]),
      },
      {
        title: "Payments",
        columns: [{ label: "Date", kind: "date" }, { label: "Invoice #" }, { label: "Method" }, { label: "Amount", kind: "money" }],
        rows: invoices.flatMap((i) => i.payments.map((p) => [p.paidAt, displayInvoiceNumber(i), p.paymentMethod, p.amount])),
      },
      {
        title: "Adjustments",
        columns: [{ label: "Date", kind: "date" }, { label: "Reason", width: 3 }, { label: "Amount", kind: "money" }],
        rows: adjustments.map((a) => [a.date, a.reason, a.amount]),
      }
    );
  }
  sections.push(taskSection(tasks, false));
  return { title: `${service.client.name} — ${service.name}`, sections };
}
