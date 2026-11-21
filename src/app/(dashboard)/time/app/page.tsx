import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { auth } from "@/auth";
import { blockCaregiverRoute } from "@/lib/rbac";
import { isTrackedHere } from "@/lib/activity-monitoring";
import { getAppUrl } from "@/lib/email";
import { db } from "@/lib/db";
import { latestDownloads } from "@/lib/agent-releases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectDesktopApp } from "@/components/activity/connect-desktop-app";


export default async function DesktopAppPage() {
  await blockCaregiverRoute("/hours");
  const session = await auth();
  if (!session?.user || !(await isTrackedHere(session.user.id))) redirect("/time");
  // What to type in the app's Workspace field if signing in by hand: the short name on the
  // product's domain, or the full address anywhere else (local testing).
  const address = await getAppUrl();
  const workspace = (() => {
    const { hostname, origin } = new URL(address);
    const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
    return root && root !== "localhost" && hostname.endsWith(`.${root}`) ? hostname.slice(0, -root.length - 1) : origin;
  })();
  // Newest installers from the update manifests in agent-releases/ (see desktop/RELEASING.md).
  const [latest, device] = await Promise.all([
    latestDownloads(),
    // Most recently connected computer still signed in, for the "Connected" line.
    db.agentDevice.findFirst({
      where: { userId: session.user.id, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { name: true },
    }),
  ]);
  const downloads = [
    { key: "windows", os: "Windows", release: latest.windows },
    { key: "mac", os: "Mac with Apple chip (M1 or later)", release: latest.macArm },
    { key: "mac", os: "Mac with Intel chip", release: latest.macIntel },
  ];
  // The visitor's own computer goes first. Browsers don't say which Mac chip
  // it is, so a Mac gets both Mac buttons.
  const ua = (await headers()).get("user-agent") ?? "";
  const mine = /Windows/i.test(ua) ? "windows" : /Macintosh|Mac OS X/i.test(ua) ? "mac" : null;
  const primary = downloads.filter((d) => d.key === mine);
  const others = downloads.filter((d) => d.key !== mine);

  const downloadButton = (d: (typeof downloads)[number], variant: "default" | "outline") =>
    d.release ? (
      <Button key={d.os} variant={variant} nativeButton={false} render={<a href={`/api/agent/updates/${d.release.file}`} />}>
        <Download /> {d.os} · v{d.release.version}
      </Button>
    ) : (
      <Button key={d.os} variant="outline" disabled>
        {d.os}: coming soon
      </Button>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/time" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ChevronLeft className="size-4" /> Time
        </Link>
        <h1 className="text-2xl font-semibold">Carenela desktop app</h1>
        <p className="text-sm text-muted-foreground">
          Office staff clock in, take breaks and clock out from the desktop app. It sits in your system tray while you work. Setting
          it up takes three steps.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Download and install</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {primary.length > 0 && <div className="flex flex-wrap gap-2">{primary.map((d) => downloadButton(d, "default"))}</div>}
          <div className="flex flex-wrap gap-2">{others.map((d) => downloadButton(d, primary.length ? "outline" : "default"))}</div>
          {mine !== "windows" && (
            <p className="text-xs text-muted-foreground">
              Not sure which Mac you have? Apple menu &gt; About This Mac: &quot;Chip: Apple M…&quot; means Apple chip, &quot;Processor:
              Intel&quot; means Intel.
            </p>
          )}
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {mine !== "mac" && (
              <li>
                <strong>Windows:</strong> run the downloaded file. If Windows shows &quot;Windows protected your PC&quot;, click{" "}
                <strong>More info</strong>, then <strong>Run anyway</strong>. (The app isn&apos;t signed with a paid certificate, so
                Windows doesn&apos;t recognise it yet.)
              </li>
            )}
            {mine !== "windows" && (
              <li>
                <strong>Mac:</strong> open the downloaded file and drag Carenela into Applications. Open it once; when the Mac says it
                can&apos;t be opened, go to System Settings &gt; Privacy &amp; Security, scroll down and click{" "}
                <strong>Open Anyway</strong>, then confirm.
              </li>
            )}
            <li>The app adds an icon to your system tray (bottom right on Windows, top right on Mac).</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Connect the app</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            With the app installed and running, click the button. The app signs in to this workspace as you; no workspace name or
            password to type. Then read the monitoring notice in the app and accept it.
          </p>
          <ConnectDesktopApp workspace={workspace} connectedDevice={device?.name ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Clock in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Click the tray icon, then Clock in. The icon turns green while your time is counting.</p>
          <p className="text-muted-foreground">
            On a Mac, allow Screen Recording and Accessibility when asked, then reopen the app. After each update you may need to
            allow them again.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What it records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Only while you&apos;re clocked in:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>One screenshot of each screen at a random moment every 30 minutes.</li>
            <li>Which app is in front, its window title, and on a Mac the website&apos;s domain.</li>
          </ul>
          <p>It never records what you type or counts keys and clicks; it only notices whether there has been any input.</p>
          <p>
            Updates install by themselves on Windows when you&apos;re clocked out. On a Mac the tray menu shows &quot;Download update&quot;
            when there&apos;s a new version; install it the same way as the first time.
          </p>
          <p>
            If the computer has no keyboard or mouse input for 2 hours, the app clocks you out from when the input stopped. You can
            see everything it recorded under{" "}
            <Link href="/time/activity" className="text-primary hover:underline">
              My activity
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
