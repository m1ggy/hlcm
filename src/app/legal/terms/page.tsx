import type { Metadata } from "next";
import { legalEntity } from "@/lib/legal";
import { A, OL, P, Section, UL } from "../legal-ui";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const e = legalEntity();
  return (
    <>
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <P>
        These Terms of Service (the &quot;Terms&quot;) are an agreement between {e.name}, a {e.state}{" "}company (&quot;we&quot;,
        &quot;us&quot;), and the organization that signs up for a {e.product}{" "}workspace (the &quot;Customer&quot; or
        &quot;you&quot;). The person who accepts these Terms confirms that they are authorized to bind the Customer. The{" "}
        <A href="/legal/baa">Business Associate Agreement</A>, the <A href="/legal/privacy">Privacy Policy</A> and the{" "}
        <A href="/legal/subprocessors">Subprocessor list</A> are part of these Terms.
      </P>

      <Section n="1" title="The service">
        <P>
          {e.product}{" "}is web software for care businesses and the teams that support them: client and case management,
          licensing applications, tasks and projects, forms, scheduling and visits, time tracking, invoicing, payroll and
          related tools (the &quot;Service&quot;). Each Customer gets its own workspace. We may improve, change or remove
          features over time; we won&apos;t make a change that materially reduces the core Service during a paid period
          without telling you first.
        </P>
      </Section>

      <Section n="2" title="Accounts and users">
        <UL>
          <li>The workspace owner manages who has access, what role each user has, and when access ends.</li>
          <li>You are responsible for your users&apos; activity in your workspace and for keeping sign-in details private. Tell us right away if you think an account has been compromised.</li>
          <li>Users must be at least 18 and must use their own account. Shared logins aren&apos;t allowed.</li>
          <li>We may require two-factor sign-in for some roles.</li>
        </UL>
      </Section>

      <Section n="3" title="Plans, trial and payment">
        <UL>
          <li>Plans are billed monthly per workspace at the prices shown when you subscribe. Every active user counts toward your plan&apos;s user limit, including caregivers; users above the limit are billed as extra users, prorated.</li>
          <li>New workspaces may get a free trial. A payment card is collected at sign-up and charged automatically when the trial ends unless you cancel before then.</li>
          <li>Fees are charged in advance and are non-refundable except where the law requires otherwise. Sales tax and similar taxes are added where they apply.</li>
          <li>If a payment fails, we retry it and notify the owner. If it is still unpaid 14 days later, the workspace is locked until it is paid. While locked, the owner can still pay and export data, and nothing is deleted.</li>
          <li>We may change prices with at least 30 days&apos; notice; the new price applies from your next billing period.</li>
          <li>Payments are processed by Stripe. We don&apos;t store full card numbers.</li>
        </UL>
      </Section>

      <Section n="4" title="Your data">
        <P>
          &quot;Customer Data&quot; is everything you and your users put into the Service, including information about your
          clients, care recipients, staff and applicants. You own Customer Data. You give us permission to host, copy,
          process and display it only as needed to provide, secure and support the Service, and as described in the
          Business Associate Agreement for any protected health information.
        </P>
        <UL>
          <li>We don&apos;t sell Customer Data and don&apos;t use it to advertise.</li>
          <li>You are responsible for having the right to put Customer Data into the Service, including any consents your clients, staff or applicants must give, and for its accuracy.</li>
          <li>You can export your data at any time while your workspace is active or locked for non-payment.</li>
        </UL>
      </Section>

      <Section n="5" title="Our access to your workspace">
        <P>
          Our staff don&apos;t browse workspaces. We access a workspace only to provide the Service, keep it secure, fix a
          problem, meet a legal obligation, or help you when you ask. Support access to a workspace&apos;s data is granted by
          the workspace owner, is limited in time, and is logged. Platform administrators&apos; entries into a workspace are
          recorded and visible to its owner.
        </P>
      </Section>

      <Section n="6" title="Optional features that use outside services">
        <UL>
          <li>
            <strong>AI-written summaries.</strong> Some workspaces can have short client updates drafted by an AI model
            (Anthropic&apos;s Claude). Only the facts needed for the summary are sent, such as task and project names,
            status changes, file names and comments marked visible to the client. Hours, internal comments and file
            contents are not sent. The provider doesn&apos;t use this data to train its models. The feature can be turned
            off for each workspace, and a person can edit or replace any AI-written text before or after it is sent.
          </li>
          <li>
            <strong>Text messages.</strong> Staff can choose to receive text alerts. Message and data rates may apply.
            Reply STOP to stop texts at any time.
          </li>
          <li>
            <strong>Public links.</strong> Forms and share links you publish can be opened by anyone who has the link. You
            decide what they contain and who you give them to, and you can turn them off at any time.
          </li>
          <li>
            <strong>Integrations you connect.</strong> If you connect your own account with another provider (for example
            Stripe, DocuSign, Calendly, Twilio, Wise or Microsoft Teams), your use of that provider is under your agreement
            with them, and data sent to them leaves the Service under your instructions.
          </li>
        </UL>
      </Section>

      <Section n="7" title="Acceptable use">
        <P>You agree not to, and not to let anyone else:</P>
        <OL>
          <li>break the law, or use the Service to send spam or messages people haven&apos;t agreed to receive;</li>
          <li>upload malware, or try to get into other workspaces, accounts or systems you aren&apos;t authorized to use;</li>
          <li>interfere with the Service&apos;s security or performance, or test it for vulnerabilities without our written permission;</li>
          <li>copy, resell or reverse-engineer the Service, or use it to build a competing product;</li>
          <li>put into the Service data you have no right to use.</li>
        </OL>
        <P>
          We may suspend access that breaks these rules or puts the Service or other customers at risk. Where we can, we
          will tell you first and give you a chance to fix the problem.
        </P>
      </Section>

      <Section n="8" title="Security and availability">
        <P>
          We protect Customer Data with administrative, physical and technical safeguards appropriate to its sensitivity,
          including encryption in transit, separation of each workspace&apos;s data, access controls, audit logs, malware
          scanning of uploaded files and regular backups. We aim to keep the Service available at all times but don&apos;t
          promise it will be uninterrupted; planned maintenance is done at quiet times where possible. If we learn of a
          security incident affecting your data, we will notify you as set out in the Business Associate Agreement and as
          the law requires.
        </P>
      </Section>

      <Section n="9" title="Term, cancellation and deleting data">
        <UL>
          <li>These Terms last while you have a workspace. You can cancel at any time; your plan stays active until the end of the period you&apos;ve paid for.</li>
          <li>We may end these Terms if you materially break them and don&apos;t fix it within 30 days of notice, or right away for serious misuse or non-payment after the lock period.</li>
          <li>After your workspace ends, you have 30 days to export your data. After that we delete Customer Data from the live Service. Copies in backups are removed as those backups expire in the normal cycle, and stay protected until then.</li>
          <li>Sections 4, 10, 11, 12 and 13 continue after these Terms end.</li>
        </UL>
      </Section>

      <Section n="10" title="Confidentiality">
        <P>
          Each of us will keep the other&apos;s non-public information confidential, use it only for this agreement, and
          share it only with people who need it and are bound to keep it confidential. This doesn&apos;t cover information
          that is public, already known, independently developed, or that must be disclosed by law (with notice where
          allowed).
        </P>
      </Section>

      <Section n="11" title="Warranties and disclaimer">
        <P>
          We will provide the Service with reasonable care and skill. Apart from that, the Service is provided &quot;as
          is&quot;, and we disclaim all other warranties, express or implied, including merchantability, fitness for a
          particular purpose and non-infringement. The Service is a tool: it doesn&apos;t give legal, licensing, clinical,
          tax or payroll advice, and you remain responsible for your filings, care decisions, invoices and payments.
        </P>
      </Section>

      <Section n="12" title="Limits of liability">
        <P>
          Neither of us is liable for indirect, incidental, special, consequential or punitive damages, or for lost profits
          or revenue. Each party&apos;s total liability under these Terms is limited to the fees you paid in the 12 months
          before the event that caused the claim. These limits don&apos;t apply to your payment obligations, to either
          party&apos;s breach of confidentiality, or to liability that can&apos;t be limited by law.
        </P>
      </Section>

      <Section n="13" title="Indemnity">
        <P>
          You will defend us against claims by third parties that arise from Customer Data or from your use of the Service
          in breach of these Terms or the law, and pay any resulting damages and reasonable costs. We will defend you
          against claims that the Service, as we provide it, infringes someone else&apos;s intellectual property, and pay any
          resulting damages and reasonable costs.
        </P>
      </Section>

      <Section n="14" title="General">
        <UL>
          <li>These Terms are governed by the laws of the State of {e.state}, without regard to its conflict-of-laws rules. Disputes go to the state or federal courts located in {e.state}.</li>
          <li>We may update these Terms. For a material change we will tell the workspace owner at least 30 days in advance, and the owner will be asked to accept the new version. If you don&apos;t agree, you can cancel before the change takes effect.</li>
          <li>Neither party may transfer this agreement without the other&apos;s consent, except as part of a merger or sale of the business.</li>
          <li>Neither party is responsible for delays caused by events beyond its reasonable control.</li>
          <li>If any part of these Terms can&apos;t be enforced, the rest still applies. Not enforcing a right isn&apos;t a waiver of it.</li>
          <li>These Terms, with the documents they include, are the whole agreement between us about the Service. If they conflict, the Business Associate Agreement controls for protected health information.</li>
          <li>Notices to us: {e.email}, {e.address}. Notices to you go to the workspace owner&apos;s email address.</li>
        </UL>
      </Section>
    </>
  );
}
