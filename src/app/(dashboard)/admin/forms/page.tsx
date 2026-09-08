import Link from "next/link";
import { Pencil } from "lucide-react";
import { auth } from "@/auth";
import { listFormTemplates } from "@/lib/actions/form-templates";
import { FormTemplateDialog } from "@/components/admin/form-template-dialog";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { blockCaregiverRoute } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function FormTemplatesPage() {
  await blockCaregiverRoute();
  const session = await auth();
  const canManage = session?.user?.role === "ADMIN";
  const templates = await listFormTemplates();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Forms</h1>
          <PageInfoButton title="Forms">
            <p>
              Build a public intake form once, then share its link anywhere — no login required to fill it out.
              Every submission lands in the{" "}
              <Link href="/admin/forms/inbox" className="underline">
                Form Submissions
              </Link>{" "}
              queue for review; nothing is added to the CRM automatically.
            </p>
          </PageInfoButton>
        </div>
        {canManage && <FormTemplateDialog />}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead>Submissions</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
              </TableCell>
              <TableCell>
                <CopyLinkButton path={`/forms/${t.slug}`} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
              </TableCell>
              <TableCell className="text-muted-foreground">{t._count.submissions}</TableCell>
              <TableCell>
                <Badge variant={t.active ? "outline" : "secondary"}>{t.active ? "Active" : "Inactive"}</Badge>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <FormTemplateDialog
                    template={t}
                    trigger={
                      <Button variant="ghost" size="icon-sm" title="Edit form">
                        <Pencil className="size-3.5" />
                      </Button>
                    }
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                No forms yet — create one to get a shareable intake link.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
