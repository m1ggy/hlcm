import Link from "next/link";
import { listApplications } from "@/lib/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";

export default async function PortalHomePage() {
  const applications = await listApplications();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your Applications</h1>
      {applications.length === 0 && (
        <p className="text-muted-foreground">No applications have been shared with you yet.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {applications.map((app) => (
          <Link key={app.id} href={`/portal/applications/${app.id}`}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{app.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{app.client.name}</p>
                <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                  {STATUS_LABELS[app.status as ApplicationStatus]}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
