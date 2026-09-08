"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Ban } from "lucide-react";
import { dismissSubmission } from "@/lib/actions/form-submissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateClientFromSubmissionDialog } from "./create-client-from-submission-dialog";
import { AttachSubmissionDialog } from "./attach-submission-dialog";

type Field = { id: string; key: string; label: string; type: string; clientField: string | null };
type SubmissionFile = { id: string; fieldKey: string; fileName: string; sizeBytes: number };
type Submission = {
  id: string;
  answers: Record<string, string>;
  status: "PENDING" | "REVIEWED" | "DISMISSED";
  createdAt: Date;
  template: { name: string; fields: Field[] };
  client: { id: string; name: string } | null;
  files: SubmissionFile[];
};

const STATUS_TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "REVIEWED", label: "Reviewed" },
  { key: "DISMISSED", label: "Dismissed" },
  { key: "all", label: "All" },
] as const;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FormSubmissionsInbox({
  submissions,
  clients,
  projects,
  currentFilter,
}: {
  submissions: Submission[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  currentFilter: string;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  function handleDismiss(id: string) {
    if (!confirm("Dismiss this submission? It'll be marked as spam/duplicate — nothing is deleted.")) return;
    setDismissingId(id);
    startTransition(async () => {
      try {
        await dismissSubmission(id);
        toast.success("Dismissed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to dismiss");
      } finally {
        setDismissingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "PENDING" ? "/admin/forms/inbox" : `/admin/forms/inbox?status=${tab.key}`}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              currentFilter === tab.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {submissions.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      )}

      <div className="space-y-2">
        {submissions.map((submission) => {
          const expanded = expandedId === submission.id;
          const defaults: Record<string, string> = {};
          for (const field of submission.template.fields) {
            if (field.clientField && submission.answers[field.key]) {
              defaults[field.clientField] = submission.answers[field.key];
            }
          }

          return (
            <div key={submission.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : submission.id)}
                className="flex w-full items-center gap-2 p-3 text-left"
              >
                {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{submission.template.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(submission.createdAt).toLocaleString()}
                  </span>
                </span>
                {submission.client && (
                  <Link
                    href={`/clients/${submission.client.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {submission.client.name}
                  </Link>
                )}
                <Badge
                  variant={
                    submission.status === "PENDING" ? "default" : submission.status === "DISMISSED" ? "secondary" : "outline"
                  }
                >
                  {submission.status}
                </Badge>
              </button>

              {expanded && (
                <div className="space-y-4 border-t p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {submission.template.fields
                      .filter((f) => f.type !== "FILE")
                      .map((field) => (
                        <div key={field.id} className="min-w-0">
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <p className="truncate text-sm" title={submission.answers[field.key] ?? ""}>
                            {submission.answers[field.key] || "—"}
                          </p>
                        </div>
                      ))}
                  </div>

                  {submission.files.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Files</p>
                      <div className="flex flex-wrap gap-2">
                        {submission.files.map((file) => (
                          <Button
                            key={file.id}
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<a href={`/api/form-submissions/${submission.id}/files/${file.id}`} />}
                          >
                            <Download className="size-3.5" /> {file.fileName} ({formatBytes(file.sizeBytes)})
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission.status === "PENDING" && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <CreateClientFromSubmissionDialog submissionId={submission.id} defaults={defaults} projects={projects} />
                      <AttachSubmissionDialog submissionId={submission.id} clients={clients} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDismiss(submission.id)}
                        loading={isPending && dismissingId === submission.id}
                      >
                        <Ban className="size-3.5" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
