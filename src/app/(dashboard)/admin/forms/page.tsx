import { redirect } from "next/navigation";

// Forms moved out of Admin to their own place in the sidebar (docs/forms-plan.md).
export default function OldFormsPage() {
  redirect("/intake/forms");
}
