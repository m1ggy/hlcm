import { redirect } from "next/navigation";

// Old address of "Forgot password?" — the workspace-scoped flow lives at
// /forgot-password (src/lib/actions/password.ts).
export default function LegacyForgotPasswordPage() {
  redirect("/forgot-password");
}
