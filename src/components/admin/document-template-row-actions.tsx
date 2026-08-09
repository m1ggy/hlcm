"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ListTree, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deactivateDocumentTemplate } from "@/lib/actions/document-templates";

type TemplateField = { key: string; label: string; source: "AUTO" | "CUSTOM"; autoField: string | null };

export function DocumentTemplateRowActions({
  templateId,
  templateName,
  fields,
  canManage,
}: {
  templateId: string;
  templateName: string;
  fields: TemplateField[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDeactivate() {
    if (!confirm(`Deactivate "${templateName}"? It'll stop showing up when generating documents on an Application — existing generated documents are unaffected.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deactivateDocumentTemplate(templateId);
        toast.success("Template deactivated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to deactivate");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="View field mapping" />}>
          <ListTree className="size-3.5" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{templateName} — field mapping</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merge tag</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={f.key}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{"{" + f.key + "}"}</TableCell>
                  <TableCell>{f.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.source === "AUTO" ? `Auto-fill (${f.autoField})` : "Prompt when generating"}
                  </TableCell>
                </TableRow>
              ))}
              {fields.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No merge tags on this template.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Download original file"
        nativeButton={false}
        render={<a href={`/api/document-templates/${templateId}`} />}
      >
        <Download className="size-3.5" />
      </Button>
      {canManage && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Deactivate"
          onClick={handleDeactivate}
          disabled={isPending}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
