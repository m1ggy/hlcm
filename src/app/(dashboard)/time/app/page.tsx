import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { auth } from "@/auth";
import { blockCaregiverRoute, isTrackedRole } from "@/lib/rbac";
import { getAppUrl } from "@/lib/email";
import { latestDownloads } from "@/lib/agent-releases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export default async function DesktopAppPage() {
  await blockCaregiverRoute("/hours");
  const session = await auth();
  if (!session?.user || !isTrackedRole(session.user.role)) redirect("/time");
  const address = getAppUrl();
  // Newest installers from the update manifests in agent-releases/ (see desktop/RELEASING.md).
  const latest = await latestDownloads();
  const downloads = [
    { os: "Windows", release: latest.windows },
    { os: "Mac with Apple chip (M1 or later)", release: latest.macArm },
    { os: "Mac with Intel chip", release: latest.macIntel },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/time" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ChevronLeft className="size-4" /> Time
        </Link>
        <h1 className="text-2xl font-semibold">HCLM desktop app</h1>
        <p className="text-sm text-muted-foreground">
          Office staff clock in, take breaks and clock out from the desktop app. It sits in your system tray while you work.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {downloads.map((d) =>
              d.release ? (
                <Button key={d.os} nativeButton={false} render={<a href={`/api/agent/updates/${d.release.file}`} />}>
                  <Download /> {d.os} · v{d.release.version}
                </Button>
              ) : (
                <Button key={d.os} variant="outline" disabled>
                  {d.os}: coming soon
                </Button>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Not sure which Mac you have? Apple menu &gt; About This Mac: &quot;Chip: Apple M…&quot; means Apple chip, &quot;Processor: Intel&quot; means Intel.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Set up</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              <strong>Windows:</strong> run the installer. If Windows shows &quot;Windows protected your PC&quot;, click{" "}
              <strong>More info</strong>, then <strong>Run anyway</strong>. (The app isn&apos;t signed with a paid certificate, so
              Windows doesn&apos;t recognise it yet.)
            </li>
            <li>
              <strong>Mac:</strong> open the downloaded file and drag HCLM Tracker into Applications. Open it once; when the Mac says it
              can&apos;t be opened, go to System Settings &gt; Privacy &amp; Security, scroll down and click <strong>Open Anyway</strong>,
              then confirm.
            </li>
            <li>The app adds an icon to your system tray (bottom right on Windows, top right on Mac).</li>
            <li>
              If it asks for the HCLM address, enter <code className="rounded bg-muted px-1.5 py-0.5">{address}</code>
            </li>
            <li>Sign in with your usual HCLM email, password and sign-in code.</li>
            <li>Read the monitoring notice and accept it.</li>
            <li>
              On a Mac, allow Screen Recording and Accessibility when asked, then reopen the app. After each update you may need to
              allow them again.
            </li>
            <li>Click Clock in. The tray icon turns green while your time is counting.</li>
          </ol>
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
            <li>How many keys and mouse clicks/moves per minute, never what you typed.</li>
            <li>Which app is in front, its window title, and on a Mac the website&apos;s domain.</li>
          </ul>
          <p>
            Updates install by themselves on Windows when you&apos;re clocked out. On a Mac the tray menu shows &quot;Download update&quot;
            when there&apos;s a new version; install it the same way as the first time.
          </p>
          <p>
            After 15 minutes with no input it asks whether you were working. Answering No, or not answering within 5 minutes,
            clocks you out from when you went idle. You can see everything it recorded under{" "}
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
