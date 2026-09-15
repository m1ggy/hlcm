"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Ban, Video, Mail, ListTodo, CalendarX } from "lucide-react";
import { markLeadLost, sendFollowUpEmail, cancelLeadBooking } from "@/lib/actions/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateClientFromLeadDialog } from "./create-client-from-lead-dialog";
import { AttachLeadDialog } from "./attach-lead-dialog";
import { LeadStagePicker, LEAD_STAGE_LABELS } from "./lead-stage-picker";
import { LeadAssigneePicker } from "./lead-assignee-picker";
import type { $Enums } from "@/generated/prisma/client";

type QuestionAnswer = { question: string; answer: string };
type LinkedTask = { id: string; label: string; status: string; dueDate: Date | null };
type Lead = {
  id: string;
  stage: $Enums.LeadStage;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  timezone: string | null;
  meetingStartAt: Date;
  meetingJoinUrl: string | null;
  answers: unknown;
  canceledAt: Date | null;
  createdAt: Date;
  client: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  tasks: LinkedTask[];
};

const STAGE_TABS = [
  { key: "all", label: "All" },
  ...(Object.entries(LEAD_STAGE_LABELS) as [$Enums.LeadStage, string][]).map(([key, label]) => ({ key, label })),
];

export function LeadsInbox({
  leads,
  clients,
  projects,
  assignableUsers,
  currentFilter,
}: {
  leads: Lead[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  assignableUsers: { id: string; name: string }[];
  currentFilter: string;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [losingId, setLosingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  function handleMarkLost(id: string) {
    if (!confirm("Mark this lead as lost? It'll stay visible here, just filed under Lost.")) return;
    setLosingId(id);
    startTransition(async () => {
      try {
        await markLeadLost(id);
        toast.success("Marked as lost");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update");
      } finally {
        setLosingId(null);
      }
    });
  }

  // Sends the invitee a real Calendly cancellation email — confirm first,
  // same as Mark lost, since it's outward-facing and can't be undone here.
  function handleCancelBooking(id: string) {
    if (!confirm("Cancel this Calendly booking? The invitee gets a real cancellation email from Calendly.")) return;
    setCancelingId(id);
    startTransition(async () => {
      try {
        await cancelLeadBooking(id);
        toast.success("Booking canceled");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel booking");
      } finally {
        setCancelingId(null);
      }
    });
  }

  // One click, no confirm — see sendFollowUpEmail's own comment for why.
  function handleSendFollowUp(id: string) {
    setSendingId(id);
    startTransition(async () => {
      try {
        await sendFollowUpEmail(id);
        toast.success("Follow-up sent");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send follow-up");
      } finally {
        setSendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {STAGE_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "BOOKED" ? "/leads" : `/leads?stage=${tab.key}`}
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

      {leads.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}

      <div className="space-y-2">
        {leads.map((lead) => {
          const expanded = expandedId === lead.id;
          const qa = Array.isArray(lead.answers) ? (lead.answers as QuestionAnswer[]) : [];

          return (
            <div key={lead.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : lead.id)}
                className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
              >
                {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{lead.inviteeName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(lead.meetingStartAt).toLocaleString()}</span>
                </span>
                {lead.client && (
                  <Link
                    href={`/clients/${lead.client.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {lead.client.name}
                  </Link>
                )}
                {lead.assignedTo && (
                  <span className="text-xs text-muted-foreground" title="Assigned to">
                    {lead.assignedTo.name}
                  </span>
                )}
                {lead.canceledAt && (
                  <Badge variant="destructive" className="text-[0.65rem]">
                    Canceled
                  </Badge>
                )}
                <Badge variant={lead.stage === "CONVERTED" ? "default" : lead.stage === "LOST" ? "secondary" : "outline"}>
                  {LEAD_STAGE_LABELS[lead.stage]}
                </Badge>
              </button>

              {expanded && (
                <div className="space-y-4 border-t p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm">{lead.inviteeEmail}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm">{lead.inviteePhone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Timezone</p>
                      <p className="text-sm">{lead.timezone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Booked</p>
                      <p className="text-sm">{new Date(lead.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {lead.tasks.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <ListTodo className="size-3.5 text-muted-foreground" />
                      <span>
                        Follow-up task: {lead.tasks[0].label}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({lead.tasks[0].status}
                          {lead.tasks[0].dueDate && `, due ${new Date(lead.tasks[0].dueDate).toLocaleDateString()}`})
                        </span>
                      </span>
                    </div>
                  )}

                  {lead.meetingJoinUrl && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<a href={lead.meetingJoinUrl} target="_blank" rel="noopener noreferrer" />}>
                      <Video className="size-3.5" /> Join link
                    </Button>
                  )}

                  {qa.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Intake answers</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {qa.map((item, i) => (
                          <div key={i} className="min-w-0">
                            <p className="text-xs text-muted-foreground">{item.question}</p>
                            <p className="truncate text-sm" title={item.answer}>
                              {item.answer || "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lead.stage !== "CONVERTED" && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <CreateClientFromLeadDialog
                        leadId={lead.id}
                        defaults={{ name: lead.inviteeName, businessEmail: lead.inviteeEmail, businessPhone: lead.inviteePhone ?? "" }}
                        projects={projects}
                      />
                      <AttachLeadDialog leadId={lead.id} clients={clients} />
                      <LeadStagePicker leadId={lead.id} stage={lead.stage} />
                      <LeadAssigneePicker leadId={lead.id} assignedTo={lead.assignedTo} users={assignableUsers} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendFollowUp(lead.id)}
                        loading={isPending && sendingId === lead.id}
                      >
                        <Mail className="size-3.5" /> Send follow-up
                      </Button>
                      {!lead.canceledAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleCancelBooking(lead.id)}
                          loading={isPending && cancelingId === lead.id}
                        >
                          <CalendarX className="size-3.5" /> Cancel booking
                        </Button>
                      )}
                      {lead.stage !== "LOST" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleMarkLost(lead.id)}
                          loading={isPending && losingId === lead.id}
                        >
                          <Ban className="size-3.5" /> Mark lost
                        </Button>
                      )}
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
