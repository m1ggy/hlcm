import { notFound } from "next/navigation";
import { getPublicFormTemplate } from "@/lib/actions/public-forms";
import { PublicIntakeForm } from "@/components/forms/public-intake-form";

// No auth, no app chrome — see isPublicPath in src/auth.config.ts for what
// lets this route through with no session at all. An inactive or unknown
// slug 404s the same way, so a deactivated form's old link doesn't leak
// that it ever existed.
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = await getPublicFormTemplate(slug);
  if (!template) notFound();

  return (
    <div className="flex min-h-screen justify-center bg-muted p-4 py-12">
      <div className="w-full max-w-lg">
        <PublicIntakeForm
          templateId={template.id}
          name={template.name}
          description={template.description}
          fields={template.fields}
        />
      </div>
    </div>
  );
}
