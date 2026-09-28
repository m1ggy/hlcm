import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { LoginForm } from "./login-form";

// Titled with the workspace being signed in to (the request host's
// organization), so people can tell which one they're on.
export default async function LoginPage() {
  const org = await getHostOrg();
  return <LoginForm title={`${org?.status === "ACTIVE" ? org.name : PRODUCT_NAME} — Sign in`} />;
}
