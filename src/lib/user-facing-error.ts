// An error whose message is written for the person using the app and is safe
// to show them verbatim ("File is larger than 200MB", "Not permitted").
//
// Why this exists: in a production build, Next.js redacts the message of
// anything a Server Action *throws* — the browser sees "An error occurred in
// the Server Components render. The specific message is omitted in
// production builds…" no matter what the action said. Only values a Server
// Action *returns* survive intact. toActionResult (src/lib/action-result.ts)
// turns a thrown UserFacingError into a returned `{ ok: false, error }`;
// every other error (bugs, GCS/DB internals, redirects) still throws and
// stays redacted, so internals never reach a toast.
//
// Kept dependency-free so both server and client bundles can import it.
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
