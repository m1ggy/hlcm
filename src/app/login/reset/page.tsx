import { redirect } from "next/navigation";

// Reset links emailed before password resets became single-use and
// workspace-scoped (/set-password) land here: ask for a fresh link.
export default function LegacyResetPasswordPage() {
  redirect("/forgot-password");
}
