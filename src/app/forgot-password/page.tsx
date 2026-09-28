import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const org = await getHostOrg();
  return <ForgotPasswordForm title={`${org?.status === "ACTIVE" ? org.name : PRODUCT_NAME} — Reset password`} />;
}
