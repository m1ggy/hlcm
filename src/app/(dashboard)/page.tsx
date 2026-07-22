import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applicationVisibilityFilter } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  const [projectCount, clientCount, applicationCount] = await Promise.all([
    prisma.project.count({ where: { active: true } }),
    prisma.client.count(),
    prisma.application.count({ where: applicationVisibilityFilter(session) }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
        <p className="text-muted-foreground">Role: {session.user.role}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{projectCount}</CardContent>
          </Card>
        </Link>
        <Link href="/clients">
          <Card>
            <CardHeader>
              <CardTitle>Clients</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{clientCount}</CardContent>
          </Card>
        </Link>
        <Link href="/applications">
          <Card>
            <CardHeader>
              <CardTitle>Your Applications</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{applicationCount}</CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
