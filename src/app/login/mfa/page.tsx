import { redirect } from "next/navigation";
import { hasPendingMfaChallenge } from "@/lib/actions/auth";
import { MfaForm } from "./mfa-form";

export default async function LoginMfaPage() {
  if (!(await hasPendingMfaChallenge())) {
    redirect("/login");
  }

  return <MfaForm />;
}
