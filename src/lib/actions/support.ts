"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

// The workspace side of a platform admin entering it (src/lib/support-access.ts):
// the one-time link from the console signs them in.

/** /support/enter's button: trades the one-time link for a session. */
export async function enterAsSupport(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await signIn("credentials", { supportToken: token, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/support/enter?error=1");
    throw error;
  }
}
