// Maps a Notification's entityType to the route that shows it. Shared by
// the notification bell (client-side nav) and the email sender (absolute
// links in the notification email) so the two never drift apart.
//
// Two variants because staff and portal users land on different routes for
// the same entity (e.g. an Application lives at /applications/[id] for
// staff, /portal/applications/[id] for clients). Keyed by a plain string
// discriminator, not passed as a prop of functions — functions aren't
// serializable across the Server -> Client Component boundary, so this
// table has to live in code both sides import, not travel as a prop.
export type EntityLinkVariant = "staff" | "portal";

export const ENTITY_LINKS: Record<EntityLinkVariant, Record<string, (id: string) => string>> = {
  staff: {
    Task: () => "/tasks",
    Application: (id) => `/applications/${id}`,
    Client: (id) => `/clients/${id}`,
    Invoice: (id) => `/invoices/${id}`,
  },
  portal: {
    Application: (id) => `/portal/applications/${id}`,
  },
};
