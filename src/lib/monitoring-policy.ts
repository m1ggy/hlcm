// The notice every tracked person accepts in the desktop app before their
// first clock-in (stored per version in MonitoringConsent). Each workspace
// may write its own (Organization.monitoringPolicy); otherwise it gets this
// default. A workspace's version is "<base>.<monitoringPolicyVersion>", so
// editing the workspace's text, or a change to the default below, asks
// everyone to accept again on their next app launch.
//
// DRAFT: needs owner/legal sign-off before rollout (some states, e.g. NY,
// CT and DE, require written notice of electronic monitoring).

const DEFAULT_POLICY_VERSION = "2026-11-18-draft";

export const DEFAULT_MONITORING_POLICY_TEXT = `Activity monitoring notice

While you are clocked in through the Carenela desktop app, the app records:

• A screenshot of all your screens, once every 30 minutes at a random moment.
• Which app is in front, its window title and, for supported browsers on Mac, the website's domain.

It never records keyboard or mouse input or what you type. If there is no keyboard or mouse input for 2 hours, you are clocked out automatically at the moment input stopped.

Nothing is recorded while you are clocked out or on a break.

Screenshots may show client information, so they are stored encrypted, can only be viewed by your company's owner, and every view is logged. You can see your own screenshots and activity in the web app. You cannot delete screenshots; they are deleted automatically after 90 days.

Clocking in for work is only possible through the desktop app. By accepting, you confirm you have read and understood this notice.`;

export type MonitoringPolicy = { version: string; text: string };

/** The policy a workspace shows, and the version people accept. */
export function monitoringPolicyFor(org: { monitoringPolicy: string | null; monitoringPolicyVersion: number }): MonitoringPolicy {
  const custom = org.monitoringPolicy?.trim();
  return custom
    ? { version: `custom.${org.monitoringPolicyVersion}`, text: custom }
    : { version: `${DEFAULT_POLICY_VERSION}.${org.monitoringPolicyVersion}`, text: DEFAULT_MONITORING_POLICY_TEXT };
}
