import { PRODUCT_NAME } from "@/lib/branding";
import { FindWorkspaceForm } from "./find-workspace-form";

export default function FindWorkspacePage() {
  return <FindWorkspaceForm productName={PRODUCT_NAME} />;
}
