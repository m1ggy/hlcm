"use client";

import { useRef } from "react";
import { submitForm } from "@/lib/actions/public-forms";
import { FormRenderer } from "./form-renderer";
import type { FormFieldDef } from "@/lib/form-logic";

/** The live form: posts answers (JSON) and files to submitForm, with the honeypot and fill-time check. */
export function PublicForm({
  templateId,
  title,
  description,
  fields,
  thankYouMessage,
}: {
  templateId: string;
  title: string;
  description: string | null;
  fields: FormFieldDef[];
  thankYouMessage: string | null;
}) {
  const startedAt = useRef<number | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  return (
    <div onFocusCapture={() => (startedAt.current ??= Date.now())}>
      {/* Honeypot: off-screen, out of the tab order; people never fill it, bots do. */}
      <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <FormRenderer
        fields={fields}
        title={title}
        description={description}
        thankYouMessage={thankYouMessage}
        onSubmit={async (answers, files) => {
          const data = new FormData();
          data.set("answers", JSON.stringify(answers));
          data.set("website", honeypot.current?.value ?? "");
          if (startedAt.current) data.set("startedAt", String(startedAt.current));
          for (const [key, list] of Object.entries(files)) for (const f of list) data.append(`file:${key}`, f);
          const result = await submitForm(templateId, data);
          return result.ok ? { ok: true, thankYouMessage: result.data.thankYouMessage } : result;
        }}
      />
    </div>
  );
}
