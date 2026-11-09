"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadResults, UploadTarget } from "@/lib/upload-targets";

export type UploadStatus = {
  /** What's being sent — the file name, or "3 files". */
  label: string;
  loaded: number;
  total: number;
  /** Every byte is sent; the server is scanning and storing it. */
  processing: boolean;
};

// JSON turns Dates into ISO strings; the Server Actions behind these uploads
// return Dates (createdAt and friends), so turn exactly that format back.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
function reviveDates(_key: string, value: unknown) {
  return typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value;
}

function describe(form: FormData) {
  const files = [...form.values()].filter((v): v is File => v instanceof File && v.size > 0);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return { label: files.length === 1 ? files[0].name : `${files.length} files`, total };
}

/**
 * Sends an upload to /api/uploads with XMLHttpRequest so the UI can show a
 * progress bar (fetch() can't report upload progress). Resolves with the same
 * `{ ok, data | error }` the Server Action returns; it never rejects.
 * Leaving the page (unmount) cancels an upload that's still sending.
 */
export function useUpload() {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => xhrRef.current?.abort(), []);

  const upload = useCallback(
    <K extends UploadTarget>(target: K, id: string, form: FormData, label?: string): Promise<UploadResults[K]> =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        const described = describe(form);
        const finish = (result: unknown) => {
          if (xhrRef.current === xhr) xhrRef.current = null;
          setStatus(null);
          resolve(result as UploadResults[K]);
        };

        xhr.upload.onprogress = (e) => {
          const total = e.lengthComputable ? e.total : described.total;
          setStatus((s) => s && { ...s, loaded: e.loaded, total, processing: e.loaded >= total });
        };
        xhr.upload.onload = () => setStatus((s) => s && { ...s, loaded: s.total, processing: true });
        xhr.onload = () => {
          try {
            finish(JSON.parse(xhr.responseText, reviveDates));
          } catch {
            // Not JSON: the sign-in redirect (session ran out) or a proxy error page.
            const signedOut = new URL(xhr.responseURL || location.href).pathname === "/login";
            finish({
              ok: false,
              error: signedOut
                ? "Your session has ended. Sign in again, then retry the upload."
                : xhr.status === 413
                  ? "That upload is too large"
                  : "Upload failed. Please try again.",
            });
          }
        };
        xhr.onerror = () => finish({ ok: false, error: "Upload failed. Check your connection and try again." });
        xhr.onabort = () => finish({ ok: false, error: "Upload cancelled" });

        setStatus({ label: label ?? described.label, loaded: 0, total: described.total, processing: false });
        xhr.open("POST", `/api/uploads?target=${encodeURIComponent(target)}&id=${encodeURIComponent(id)}`);
        xhr.send(form);
      }),
    []
  );

  // Only while bytes are still going up: once the server has the file,
  // aborting wouldn't stop it from being saved.
  const cancel = useCallback(() => xhrRef.current?.abort(), []);

  return { status, upload, cancel, uploading: status !== null };
}
