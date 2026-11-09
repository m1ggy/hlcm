"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadResults, UploadTarget } from "@/lib/upload-targets";

export type UploadStatus = {
  /** What's being sent — the file name, or "3 files". */
  label: string;
  /** Set during uploadMany(): "File 2 of 5". */
  step?: string;
  loaded: number;
  total: number;
  /** The current file is fully sent; the server is scanning and storing it. */
  processing: boolean;
};

export type BatchOutcome<K extends UploadTarget> = {
  /** Files that went up, with what the server returned for each. */
  uploaded: { file: File; data: Extract<UploadResults[K], { ok: true }>["data"] }[];
  /** Files that didn't, with the reason. */
  failed: { file: File; error: string }[];
  /** Cancel was pressed; files after the one in flight were never sent. */
  cancelled: boolean;
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

const CANCELLED = "Upload cancelled";

/**
 * Sends uploads to /api/uploads with XMLHttpRequest so the UI can show a
 * progress bar (fetch() can't report upload progress). Results are the same
 * `{ ok, data | error }` the Server Action returns; nothing here rejects.
 * Leaving the page (unmount) cancels an upload that's still sending.
 */
export function useUpload() {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);
  const processingRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      xhrRef.current?.abort();
    },
    []
  );

  // One request. `base`/`grandTotal` place it inside a batch so the bar
  // shows overall progress rather than restarting for every file.
  const send = useCallback(
    <K extends UploadTarget>(
      target: K,
      id: string,
      form: FormData,
      view: { label: string; step?: string; base: number; grandTotal: number }
    ): Promise<UploadResults[K]> =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        const finish = (result: unknown) => {
          if (xhrRef.current === xhr) xhrRef.current = null;
          resolve(result as UploadResults[K]);
        };

        xhr.upload.onprogress = (e) => {
          const fileTotal = e.lengthComputable ? e.total : view.grandTotal - view.base;
          processingRef.current = e.loaded >= fileTotal;
          setStatus({ ...view, loaded: view.base + e.loaded, total: view.grandTotal, processing: processingRef.current });
        };
        xhr.upload.onload = () => {
          processingRef.current = true;
          setStatus((s) => s && { ...s, processing: true });
        };
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
        xhr.onabort = () => finish({ ok: false, error: CANCELLED });

        processingRef.current = false;
        setStatus({ ...view, loaded: view.base, total: view.grandTotal, processing: false });
        xhr.open("POST", `/api/uploads?target=${encodeURIComponent(target)}&id=${encodeURIComponent(id)}`);
        xhr.send(form);
      }),
    []
  );

  /** Sends one form (any number of files in it) as a single request. */
  const upload = useCallback(
    async <K extends UploadTarget>(target: K, id: string, form: FormData, label?: string): Promise<UploadResults[K]> => {
      cancelledRef.current = false;
      const described = describe(form);
      const result = await send(target, id, form, { label: label ?? described.label, base: 0, grandTotal: described.total });
      setStatus(null);
      return result;
    },
    [send]
  );

  /**
   * Sends each file as its own request, one after another — one big batch
   * would hold every file in server memory at once. A failed file doesn't
   * stop the rest; Cancel stops the one in flight and skips the remainder.
   * `extra` adds fields to every file's form (e.g. clientServiceId).
   */
  const uploadMany = useCallback(
    async <K extends UploadTarget>(
      target: K,
      id: string,
      files: File[],
      extra?: Record<string, string>
    ): Promise<BatchOutcome<K>> => {
      cancelledRef.current = false;
      const outcome: BatchOutcome<K> = { uploaded: [], failed: [], cancelled: false };
      const grandTotal = files.reduce((sum, f) => sum + f.size, 0);
      let base = 0;
      for (const [i, file] of files.entries()) {
        if (cancelledRef.current) break;
        const form = new FormData();
        form.set("file", file);
        for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
        const step = files.length > 1 ? `File ${i + 1} of ${files.length}` : undefined;
        const result = await send(target, id, form, { label: file.name, step, base, grandTotal });
        base += file.size;
        if (result.ok) outcome.uploaded.push({ file, data: (result as Extract<UploadResults[K], { ok: true }>).data });
        else if (result.error === CANCELLED) break;
        else outcome.failed.push({ file, error: result.error });
      }
      outcome.cancelled = cancelledRef.current;
      setStatus(null);
      return outcome;
    },
    [send]
  );

  // Skips any queued files, and stops the file in flight while its bytes are
  // still going up. Once the server has a file it's saved regardless, so
  // that request is left to finish and show up in the list.
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (!processingRef.current) xhrRef.current?.abort();
  }, []);

  return { status, upload, uploadMany, cancel, uploading: status !== null };
}
