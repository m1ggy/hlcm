// Plain (non-"use server") module — Next.js requires every export from a
// "use server" file to itself be an async function, so this can't live in
// src/lib/actions/form-templates.ts even though it's only ever used from
// there and from the form-template builder UI.
//
// What a FormField's optional "fills in" dropdown may point at (see
// FormField.clientField in prisma/schema.prisma) — kept as the single
// source of truth both sides read from.
export const CLIENT_FIELD_OPTIONS = [
  "name",
  "contactInfo",
  "address",
  "businessName",
  "businessPhone",
  "businessEmail",
  "ownerName",
  "ownerEmail",
  "ownerPhone",
] as const;
