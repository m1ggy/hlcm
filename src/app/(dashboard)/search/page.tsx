import Link from "next/link";
import { searchAll } from "@/lib/actions/search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q ? await searchAll(q) : { applications: [], clients: [], tasks: [] };
  const hasResults = results.applications.length + results.clients.length + results.tasks.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Search results for &ldquo;{q}&rdquo;</h1>
      {!hasResults && <p className="text-muted-foreground">No matches found.</p>}

      {results.applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.applications.map((app) => (
              <Link key={app.id} href={`/applications/${app.id}`} className="block text-sm hover:underline">
                {app.name} <span className="text-muted-foreground">— {app.client.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.clients.map((client) => (
              <Link key={client.id} href="/clients" className="block text-sm hover:underline">
                {client.name}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.tasks.map((task) => (
              <Link
                key={task.id}
                href={task.application ? `/applications/${task.application.id}` : "/tasks"}
                className="block text-sm hover:underline"
              >
                {task.label} <span className="text-muted-foreground">— {task.application?.name ?? "Standalone"}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
