import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFormTemplate } from "@/lib/actions/public-forms";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { fieldDefs } from "@/lib/form-submit";
import { PublicForm } from "@/components/forms/public-form";

// A public intake form (docs/forms-plan.md). No auth, no app chrome — see
// isPublicPath in src/auth.config.ts. An inactive or unknown link 404s the
// same way, so a turned-off form's old link doesn't say it ever existed.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [template, org] = await Promise.all([getPublicFormTemplate(slug), getHostOrg()]);
  if (!template) notFound();

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-3">
          <p className="font-heading text-base font-semibold tracking-tight">{org?.name ?? PRODUCT_NAME}</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <PublicForm templateId={template.id} title={template.name} description={template.description} fields={fieldDefs(template.fields)} thankYouMessage={template.thankYouMessage} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sent securely to {org?.name ?? "us"} · Powered by {PRODUCT_NAME}
        </p>
      </main>
    </div>
  );
}
