import type { Metadata } from "next";
import { legalEntity } from "@/lib/legal";
import { P, Section } from "../legal-ui";

export const metadata: Metadata = { title: "Subprocessors" };

// The vendors that handle customer data on our behalf. Keep in step with
// what the server actually uses (.env.production on the droplet).
const SUBPROCESSORS = [
  { name: "DigitalOcean", purpose: "Hosting of the application servers and database", data: "All workspace data", location: "United States" },
  { name: "Google Cloud", purpose: "File storage for uploads and documents", data: "Uploaded files", location: "United States" },
  { name: "Resend", purpose: "Sending email (invites, notifications, invoices, copies of form answers)", data: "Email addresses and message content", location: "United States" },
  { name: "Twilio", purpose: "Text-message alerts to staff who opt in", data: "Phone numbers and short alert text", location: "United States" },
  { name: "Stripe", purpose: "Subscription billing and payments", data: "Billing contacts and payment details", location: "United States" },
  { name: "Anthropic", purpose: "AI-written client summaries, only in workspaces that use them", data: "Task and project names, status changes, file names and client-visible comments", location: "United States" },
];

export default function SubprocessorsPage() {
  const e = legalEntity();
  return (
    <>
      <h1 className="text-2xl font-semibold">Subprocessors</h1>
      <P>
        These are the service providers {e.name}{" "}uses to run {e.product}{" "}that may process customer data. Each is bound by
        a written agreement that limits its use of the data; providers that may handle protected health information are
        bound by a business associate agreement. We will update this page before adding a new subprocessor that handles
        customer data.
      </P>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">What it does</th>
              <th className="px-3 py-2 font-medium">Data involved</th>
              <th className="px-3 py-2 font-medium">Location</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-t align-top">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2">{s.purpose}</td>
                <td className="px-3 py-2">{s.data}</td>
                <td className="px-3 py-2">{s.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Integrations you connect">
        <P>
          A workspace can connect its own accounts with other providers, such as Stripe, DocuSign, Calendly, Twilio, Wise
          and Microsoft Teams. Those providers act under the workspace&apos;s own agreement with them, not as our
          subprocessors, and data is sent to them only when the workspace sets up the connection.
        </P>
      </Section>
    </>
  );
}
