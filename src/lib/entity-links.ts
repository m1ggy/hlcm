// Maps a Notification's entityType to the route that shows it. Shared by
// the notification bell (client-side nav) and the email sender (absolute
// links in the notification email) so the two never drift apart.
//
// One variant since the client portal was retired (it had its own routes);
// kept keyed by a plain string discriminator, not passed as a prop of
// functions — functions aren't serializable across the Server -> Client
// Component boundary, so this table has to live in code both sides import.
export type EntityLinkVariant = "staff";

export const ENTITY_LINKS: Record<EntityLinkVariant, Record<string, (id: string) => string>> = {
  staff: {
    Task: () => "/tasks",
    Application: (id) => `/applications/${id}`,
    Client: (id) => `/clients/${id}`,
    Invoice: (id) => `/invoices/${id}`,
    // No per-lead detail route exists (yet) — only the /leads list, same
    // situation as Task above.
    Lead: () => "/leads",
    // A Caregiver's own recipients (assignment notifications).
    CareRecipient: () => "/care-recipients",
    // Staff side of a recipient — they live on their agency's client page.
    ClientCareRecipients: (id) => `/clients/${id}#care-recipients`,
    // A concern on a recipient with no agency: the dashboard's Care visits card.
    Dashboard: () => "/",
    // A pay period on /payroll (accountant side).
    PayPeriod: (id) => `/payroll?period=${id}`,
    // Someone's own pay — the My Pay card (caregivers have it on /hours).
    MyPay: () => "/time#my-pay",
    MyPayCaregiver: () => "/hours#my-pay",
    // A project task: opens its project with the task panel showing.
    WorkTask: (id) => `/work/tasks/${id}`,
    // End-of-day reports: one report; a day of one's own; a day of the team's.
    EodReport: (id) => `/eod/r/${id}`,
    Eod: (day) => `/eod?date=${day}`,
    EodTeam: (day) => `/eod/team?date=${day}`,
    // A form submission: the inbox with it open (docs/forms-plan.md).
    FormSubmission: (id) => `/intake?open=${id}`,
  },
};
