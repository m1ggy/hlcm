import type { Metadata } from "next";
import { legalEntity } from "@/lib/legal";
import { A, OL, P, Section, UL } from "../legal-ui";

export const metadata: Metadata = { title: "Business Associate Agreement" };

// Follows the required contract terms of 45 CFR 164.504(e) and 164.314(a).
export default function BaaPage() {
  const e = legalEntity();
  return (
    <>
      <h1 className="text-2xl font-semibold">Business Associate Agreement</h1>
      <P>
        This Business Associate Agreement (&quot;BAA&quot;) is between the Customer that uses {e.product}{" "}(&quot;Covered
        Entity&quot;, which includes a customer that is itself a business associate of a covered entity) and {e.name}{" "}
        (&quot;Business Associate&quot;). It is part of the <A href="/legal/terms">Terms of Service</A> and takes effect when
        the Customer&apos;s workspace owner accepts them. It applies only to Protected Health Information that Business
        Associate creates, receives, maintains or transmits for Covered Entity through the Service.
      </P>

      <Section n="1" title="Definitions">
        <P>
          Terms used but not defined here (such as Breach, Designated Record Set, Individual, Protected Health Information
          (&quot;PHI&quot;), Electronic PHI, Required by Law, Secretary, Security Incident, Subcontractor and Unsecured PHI)
          have the meanings given in the HIPAA Rules: the Privacy, Security, Breach Notification and Enforcement Rules at 45
          CFR Parts 160 and 164, as amended by the HITECH Act. &quot;Service&quot; has the meaning in the Terms of Service.
        </P>
      </Section>

      <Section n="2" title="Permitted uses and disclosures">
        <OL>
          <li>Business Associate may use and disclose PHI only to provide the Service to Covered Entity under the Terms of Service, as this BAA permits, or as Required by Law.</li>
          <li>Business Associate may use PHI for its proper management and administration and to carry out its legal responsibilities, and may disclose PHI for those purposes if the disclosure is Required by Law, or if it obtains reasonable assurances that the recipient will keep the PHI confidential, use or disclose it only as Required by Law or for the purpose it was disclosed, and report any breach of confidentiality it becomes aware of.</li>
          <li>Business Associate may de-identify PHI in accordance with 45 CFR 164.514 and may use de-identified information only to operate, secure and improve the Service.</li>
          <li>Business Associate will not sell PHI, use it for marketing, or use or disclose it in any way that would violate the HIPAA Rules if done by Covered Entity, except as allowed in (b) and (c).</li>
          <li>Business Associate will limit its uses, disclosures and requests of PHI to the minimum necessary.</li>
        </OL>
      </Section>

      <Section n="3" title="Safeguards">
        <P>
          Business Associate will use appropriate administrative, physical and technical safeguards, and comply with Subpart
          C of 45 CFR Part 164 for Electronic PHI, to prevent use or disclosure of PHI other than as this BAA allows. These
          include access controls and role-based permissions, separation of each customer&apos;s data, encryption in transit,
          audit logging, workforce training, and logged, owner-approved support access.
        </P>
      </Section>

      <Section n="4" title="Reporting">
        <OL>
          <li>Business Associate will report to Covered Entity any use or disclosure of PHI not allowed by this BAA, and any Security Incident, of which it becomes aware.</li>
          <li>Business Associate will notify Covered Entity of a Breach of Unsecured PHI without unreasonable delay and in no case later than 10 business days after discovering it. The notice will include, to the extent known, the Individuals affected, what happened, the PHI involved, and what Business Associate is doing about it, and will be supplemented as more is learned, so that Covered Entity can meet its own notification duties under 45 CFR 164.404 to 164.410.</li>
          <li>The parties agree that this section is notice of unsuccessful Security Incidents that happen routinely, such as pings, port scans, blocked sign-in attempts and denial-of-service attempts that don&apos;t result in unauthorized access to PHI. No further report of them is required.</li>
          <li>Business Associate will reasonably mitigate, as far as practicable, any harmful effect it knows of from a use or disclosure of PHI in violation of this BAA.</li>
        </OL>
      </Section>

      <Section n="5" title="Subcontractors">
        <P>
          Business Associate will ensure, under 45 CFR 164.502(e)(1)(ii) and 164.308(b)(2), that any Subcontractor that
          creates, receives, maintains or transmits PHI on its behalf agrees in writing to the same restrictions, conditions
          and requirements that apply to Business Associate under this BAA. Current subcontractors are listed on the{" "}
          <A href="/legal/subprocessors">Subprocessors</A> page, which Business Associate will keep up to date.
        </P>
      </Section>

      <Section n="6" title="Individuals' rights">
        <OL>
          <li>Access (45 CFR 164.524): Covered Entity can view and export PHI in the Service at any time. If Covered Entity needs further help to give an Individual access, Business Associate will provide it within 15 days of a request.</li>
          <li>Amendment (45 CFR 164.526): Covered Entity can correct PHI in the Service directly. Business Associate will make any amendment Covered Entity directs that Covered Entity cannot make itself.</li>
          <li>Accounting of disclosures (45 CFR 164.528): Business Associate will document disclosures of PHI that require an accounting and provide that information to Covered Entity within 15 days of a request.</li>
          <li>If an Individual asks Business Associate directly for any of these, Business Associate will forward the request to Covered Entity within 10 business days.</li>
        </OL>
      </Section>

      <Section n="7" title="Other obligations">
        <UL>
          <li>To the extent Business Associate carries out an obligation of Covered Entity under Subpart E of 45 CFR Part 164, it will comply with the requirements of Subpart E that apply to Covered Entity in carrying out that obligation.</li>
          <li>Business Associate will make its internal practices, books and records about the use and disclosure of PHI available to the Secretary for determining compliance with the HIPAA Rules.</li>
        </UL>
      </Section>

      <Section n="8" title="Covered Entity's obligations">
        <UL>
          <li>Covered Entity will tell Business Associate of any limitation in its notice of privacy practices, any change in or revocation of an Individual&apos;s permission, and any restriction it has agreed to, to the extent it affects Business Associate&apos;s use or disclosure of PHI.</li>
          <li>Covered Entity will not ask Business Associate to use or disclose PHI in any way the HIPAA Rules would not allow Covered Entity to.</li>
          <li>Covered Entity is responsible for the PHI it chooses to put in the Service, for configuring users and permissions, for what it publishes through public forms and share links, and for any integration or optional feature it turns on, as described in the Terms of Service.</li>
        </UL>
      </Section>

      <Section n="9" title="Term and termination">
        <OL>
          <li>This BAA lasts as long as the Terms of Service, and after that until all PHI is returned or destroyed as below.</li>
          <li>If either party knows of a pattern of activity or practice of the other that is a material breach of this BAA, it may give written notice, and if the breach is not cured within 30 days, terminate the Terms of Service and this BAA.</li>
          <li>When the Terms of Service end, Covered Entity may export its data for 30 days. Business Associate will then destroy PHI in the Service and keep no copies, except copies in backups that are removed in the normal backup cycle, or where return or destruction is not feasible. For any PHI kept, Business Associate will extend the protections of this BAA and limit further use and disclosure to the purposes that make return or destruction infeasible, for as long as it keeps it.</li>
        </OL>
      </Section>

      <Section n="10" title="General">
        <UL>
          <li>A reference to a section of the HIPAA Rules means that section as in effect or as amended. The parties will amend this BAA as needed to keep up with changes in the law.</li>
          <li>This BAA is interpreted to permit compliance with the HIPAA Rules. If it conflicts with the Terms of Service about PHI, this BAA controls.</li>
          <li>Nothing in this BAA gives rights to anyone other than the parties.</li>
          <li>Notices under this BAA to Business Associate go to {e.email}; to Covered Entity, to the workspace owner&apos;s email address.</li>
        </UL>
      </Section>
    </>
  );
}
