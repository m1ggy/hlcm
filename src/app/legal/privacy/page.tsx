import type { Metadata } from "next";
import { legalEntity } from "@/lib/legal";
import { A, P, Section, UL } from "../legal-ui";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const e = legalEntity();
  return (
    <>
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <P>
        This policy explains what information {e.name}{" "}(&quot;we&quot;) collects when you use {e.product}, how we use it, and
        the choices you have.
      </P>

      <Section n="1" title="Two kinds of information">
        <UL>
          <li>
            <strong>Data our customers put into their workspaces</strong>, such as information about their clients, care
            recipients, staff and applicants. The care business that owns the workspace decides what is collected and why;
            we process it for them under our <A href="/legal/terms">Terms of Service</A> and, for health information, the{" "}
            <A href="/legal/baa">Business Associate Agreement</A>. If you are a client or employee of one of our customers,
            please contact that business about your information. We will help them respond.
          </li>
          <li>
            <strong>Information about the people who use {e.product}</strong> (account holders), which this policy mainly
            covers.
          </li>
        </UL>
      </Section>

      <Section n="2" title="What we collect about users">
        <UL>
          <li>Account details: name, email address, role, phone number if you add one, and your password (stored only as a secure hash).</li>
          <li>Sign-in and security records: when and from where you signed in (IP address, browser and device type), two-factor settings, and an audit log of changes made in the workspace.</li>
          <li>Settings and preferences, such as notification and text-alert choices.</li>
          <li>Billing details for workspace owners, handled by Stripe. We see the card brand and last four digits, not the full number.</li>
          <li>Messages you send us for support.</li>
        </UL>
        <P>We don&apos;t use advertising trackers or sell personal information.</P>
      </Section>

      <Section n="3" title="How we use it">
        <UL>
          <li>To run the Service: sign you in, show you your workspace, send the emails, texts and notifications you&apos;ve asked for, and bill the workspace.</li>
          <li>To keep it secure: detect misuse, investigate incidents and keep audit records.</li>
          <li>To support and improve it: answer questions, fix problems and understand which features are used.</li>
          <li>To meet legal obligations.</li>
        </UL>
      </Section>

      <Section n="4" title="Who we share it with">
        <P>
          We share information only with service providers that help us run {e.product}, under contracts that limit their
          use of it, as listed on our <A href="/legal/subprocessors">Subprocessors</A> page; with integrations a workspace
          chooses to connect; when the law requires it; or as part of a merger or sale of our business, with notice to you.
        </P>
      </Section>

      <Section n="5" title="Text messages">
        <P>
          If you turn on text alerts, we send texts to the number you give us about activity in your workspace (for example,
          a new form submission). Reply STOP to stop them; we record the opt-out and send no further texts. Message and data
          rates may apply. We don&apos;t share mobile numbers or text opt-in information with third parties for their own
          marketing.
        </P>
      </Section>

      <Section n="6" title="Cookies">
        <P>
          We use only the cookies needed to keep you signed in and protect against forged requests. Your browser also
          remembers a few settings, such as light or dark mode. No advertising or cross-site tracking cookies are used.
        </P>
      </Section>

      <Section n="7" title="Where data is stored and how long we keep it">
        <P>
          Data is stored on servers in the United States. We keep account information while your account is active.
          Workspace data is kept while the workspace is active and deleted after it ends as described in the Terms of
          Service. Security and audit logs are kept as long as needed for security and legal purposes.
        </P>
      </Section>

      <Section n="8" title="Security">
        <P>
          We use encryption in transit, separation of each workspace&apos;s data, role-based access, two-factor sign-in,
          audit logs and malware scanning of uploads. No system is perfectly secure; we will tell affected customers about
          incidents as the law and our agreements require.
        </P>
      </Section>

      <Section n="9" title="Your choices and rights">
        <P>
          You can update your profile and notification settings in your account. Depending on where you live, you may have
          rights to access, correct, delete or get a copy of your personal information, or to object to some uses. To make
          a request, email {e.privacyEmail}. If your information is in a customer&apos;s workspace, we may refer you to that
          customer, who controls it.
        </P>
      </Section>

      <Section n="10" title="Children">
        <P>
          {e.product}{" "}is for businesses and isn&apos;t meant for children. Information about minors may be entered by a
          customer as part of their care records, under that customer&apos;s responsibility and our agreements with them.
        </P>
      </Section>

      <Section n="11" title="Changes and contact">
        <P>
          We will post changes here and update the date below; for a material change we will also notify workspace owners.
          Contact: {e.privacyEmail}, {e.address}.
        </P>
      </Section>
    </>
  );
}
