# Search (plan, 2026-11-13)

Make search find the things staff actually look up (a lead by phone, a contact by
email, an invoice by number) and take them straight to the record. Three
phases: fix what's broken now, search more record types, then improve matching
and the results page.

## Today

Two entry points, one server action:

- **Header box** (`SearchBox`, src/components/search-box.tsx). `/` focuses it,
  Enter goes to `/search?q=…` (src/app/(dashboard)/search/page.tsx).
- **⌘K palette** (src/components/command-palette.tsx →
  command-palette-content.tsx). Debounced 200 ms, shows Recent applications
  (localStorage, src/lib/recent-applications.ts), "Go to" pages, and results.
- **`searchAll`** (src/lib/actions/search.ts) runs three queries, one after
  another, each `contains` + case-insensitive, `take: 10`, no ordering:
  - applications: `name` or `description`, `active`, `applicationVisibilityFilter`;
  - clients: `name` only, `active`; management and STAFF see all, CAREGIVER is
    limited by `caregiverClientScope`, other roles get none;
  - tasks (licensing `Task`): `label` only; non-management only see tasks
    they're assigned to.

### Bugs

1. Client results link to `/clients`, not `/clients/[id]` (search page and palette).
2. The palette leaves cmdk's own filter on (`shouldFilter` defaults to true) and
   scores against `value` strings like `` `app-${name}` ``. A result the server
   found by description (or later email/phone) is hidden on the client.
3. `CommandEmpty` ("No results found.") shows while the search is still running.
4. No guard against out-of-order responses: a slow earlier query can overwrite
   the results of a later one.
5. Tasks without an application link to the `/tasks` list instead of the task.
6. The three queries run one after another instead of with `Promise.all`.
7. On `/search`, the header box is empty, so you can't refine the query in place.

### Gaps

- Not searched at all: leads, client contacts, care recipients, projects, work
  tasks (`WorkTask`), invoices, staff users, notes.
- Clients match on name only, not contact email or phone.
- The query has to appear as one exact substring: "Smith Home Care" doesn't find
  "Home Care – Smith", and typos find nothing.
- Archived (inactive) records never appear, and there's no way to include them.
- No ranking, no counts, no "see all", no filtering by type.
- Palette "Go to" is missing most pages (Leads, Invoices, EOD, Today, Work,
  Care recipients, Client workspaces, Reports…).

## Phase 1: fix the bugs

Small, no schema change.

- Link clients to `/clients/[id]`. Link tasks to their own page or panel,
  not the list.
- Palette: `shouldFilter={false}` on `Command` (the server already filtered); show
  the empty state only when a finished search came back empty.
- Keep a request counter (or the query string) in a ref and drop any response
  that isn't for the latest query.
- `Promise.all` the queries in `searchAll`.
- `SearchBox` reads `q` from `useSearchParams()` as its default value when on `/search`.

Tests: `searchAll` returns per-role results (management / STAFF / CAREGIVER /
other) and runs nothing for an empty query.

## Phase 2: search more things

Each new type uses **the same visibility rule as its own list page**: read
that page's guard and reuse it, don't write a new rule. Pull the rules into
small helpers where they're inline today.

| Type | Fields matched | Goes to | Who |
| --- | --- | --- | --- |
| Client | name, address; contacts' name / email / phone | `/clients/[id]` | as today |
| Lead | inviteeName, inviteeEmail, inviteePhone | `/leads` (opened on that lead) | as the Leads page |
| Client contact | name, email, phone | its client | as Client |
| Care recipient | name, email, phone, address | `/care-recipients` | as that page |
| Project | name, description | `/projects/[id]` | as Projects (`blockCaregiverRoute`) |
| Work task | title, description | `/work/tasks/[id]` | members of that work project |
| Invoice | invoiceNumber, client name | `/invoices/[id]` | `canAccessInvoices` |
| Staff user | name, email | Admin › Users | management |

Matching:

- Split the query on whitespace. Every word must match some field of the record
  (`AND` of per-word `OR`s).
- Phone: strip non-digits from the query. If it has 7 or more digits, also match a
  digits-only version of the phone column. Phone formats vary, so this needs a
  normalised column or a raw `regexp_replace` comparison. Decide in D3.
- Contact hits are folded into their client ("Acme Care — via Jane Doe").

Results shape: one list of `{ type, id, title, subtitle, href }` instead of one array
per type, so the page and the palette render the same thing. Subtitles: client
name, status or stage, lead meeting date, invoice amount and status.

Palette: one type icon per result. Add the missing pages to "Go to", following
the sidebar's role rules so nobody sees a page they can't open.

## Phase 3: quality and the results page

- **Ranking and typo tolerance**: enable `pg_trgm`, add GIN trigram indexes on
  the main name / email columns, rank exact > prefix > word match > similarity.
  Needs a migration and `$queryRaw` for the similarity ordering (keep it inside
  the tenant-scoped client; see the multitenancy plan).
- **`/search` page**: tabs per type with counts, 25 per page with paging,
  an "Include archived" toggle, and a highlighted matching part of each title.
- **Palette**: "See all results for '…'" item at the bottom → `/search?q=`.
- **Recents for every type**: generalise recent-applications.ts to
  `{ type, id, title, href }`.

## Later (not in this plan)

- Searching note text and work-task comments: they're large and need care with
  client-visible vs internal notes.
- Full-text search (`tsvector`) if trigram stops being enough.

## Decisions

- **D1** Which types matter most to staff? This decides Phase 2 order. Proposed:
  leads, clients + contacts, invoices, care recipients, then the rest.
- **D2** Caregivers: keep them to their own clients (and their care recipients)?
  Proposed: yes, nothing more.
- **D3** Phone matching: a normalised `phoneDigits` column kept up to date on
  write (simple, indexable) vs `regexp_replace` at query time (no migration, slower).
  Proposed: column.
- **D4** Inactive records: hidden by default everywhere, shown only by the
  toggle on `/search`. Proposed: yes.
