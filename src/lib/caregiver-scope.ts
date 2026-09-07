// Plain (non-"use server") helper — Next.js requires every export from a
// "use server" module to itself be an async function, so this can't live
// in src/lib/actions/clients.ts alongside listCaregiverClients/
// getCaregiverClient even though it's only ever used from there and from
// searchAll's Caregiver branch (src/lib/actions/search.ts).
//
// A Caregiver's clients are whichever businesses have a case (Application)
// carrying a task they're assigned to — there's no direct Client-level
// assignment, it's derived through Task -> Application -> Client.
export function caregiverClientScope(userId: string) {
  return { applications: { some: { tasks: { some: { assignees: { some: { userId } } } } } } };
}
