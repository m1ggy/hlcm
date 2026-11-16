import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  FolderKanban,
  Inbox,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/branding";
import { orgAppUrl } from "@/lib/tenant-host";
import { WorkspaceDemo } from "@/components/home/workspace-demo";

// The product's public home page, shown at "/" on the bare root domain (the
// proxy in src/auth.ts rewrites "/" to here when the host isn't a workspace). It describes
// tasks-only workspaces (Organization.kind = TASKS, docs/workspace-tasks-plan.md)
// and nothing else — the licensing CRM isn't something we sell from here.

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — See the work being done for you`,
  description: "Your own workspace to follow the projects and tasks your team is doing for you, with a weekly summary.",
};

// Written for the client: a business with a team doing work for it, who
// gets a workspace to follow that work. Team-side tools (templates, repeat
// tasks, the approval queue) aren't pitched here.
const FEATURES = [
  {
    icon: FolderKanban,
    title: "All your projects in one place",
    body: "See every project and task your team is working on for you, who has it, when it's due and where it stands.",
  },
  {
    icon: Inbox,
    title: "Ask for work anytime",
    body: "Need something done? Send a request right from your workspace. You'll see it when the team picks it up.",
  },
  {
    icon: CheckSquare,
    title: "Updates as the work happens",
    body: "Your team checks off steps and notes what they did as they go, so you can see progress without asking.",
  },
  {
    icon: MessageSquare,
    title: "Questions on the task",
    body: "Comment on any task and get answers right there, not lost in a long email thread.",
  },
  {
    icon: Sparkles,
    title: "Your weekly summary",
    body: "A plain-language recap of what got done, what's next and anything waiting on you, with a copy by email every Monday.",
  },
  {
    icon: Users,
    title: "Bring your own people",
    body: "Invite the people at your business who should follow along. They can see the work, comment and send requests too.",
  },
];

const STEPS = [
  {
    icon: ClipboardList,
    title: "Tell us what you need",
    body: "Fill in a short form about your business. We'll get in touch and set up your workspace with the team assigned to you.",
  },
  {
    icon: Inbox,
    title: "Send your requests",
    body: "Add the work you want done, or let your team set up the projects with you.",
  },
  {
    icon: CalendarClock,
    title: "Follow along",
    body: "Check in whenever you like, or just read your weekly summary. You'll always know where things stand.",
  },
];

// "Get started" goes to a public form made with the app's own form builder
// (docs/forms-plan.md), so requests land in that workspace's intake inbox and
// set off its usual alerts. By default it's CTK's form with the link
// "get-started"; HOME_CTA_URL points it anywhere else.
function getStartedUrl(): string {
  return process.env.HOME_CTA_URL?.trim() || `${orgAppUrl(process.env.HOME_CTA_ORG_SLUG?.trim() || "ctk")}/forms/get-started`;
}

export default function HomePage() {
  const ctaUrl = getStartedUrl();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <BrandLogo />
        <nav className="flex items-center gap-2">
          <Link href="/find-workspace" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <a href={ctaUrl} className={buttonVariants({ size: "sm", className: "px-3" })}>
            Get started
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-16">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-marigold-tint px-3 py-1 text-xs font-medium text-marigold-ink">
              <span className="size-1.5 rounded-full bg-marigold" aria-hidden />
              For our clients
            </p>
            <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              See the work being done for you, as it happens.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Your own {PRODUCT_NAME} workspace shows every project and task your team is working on, what&apos;s done and
              what&apos;s next. No more chasing anyone for a status update.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={ctaUrl} className={buttonVariants({ size: "lg", className: "px-4" })}>
                Get started
                <ArrowRight data-icon="inline-end" aria-hidden />
              </a>
              <a href="#features" className={buttonVariants({ size: "lg", variant: "ghost", className: "px-4" })}>
                See how it works
              </a>
            </div>
          </div>

          <WorkspaceDemo />
        </section>

        <section id="features" className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Everything you need to stay in the loop</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              One workspace for your business, shared with the team doing your work.
            </p>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="space-y-2">
                  <Icon className="size-6 text-primary" aria-hidden />
                  <h3 className="font-heading text-lg font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="rounded-xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary font-mono text-sm text-primary-foreground">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="mt-4 font-heading text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-brand-deep px-6 py-10 text-white sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="font-heading text-2xl font-semibold">Want a workspace for your business?</h2>
              <p className="mt-1 text-white/80">Tell us a little about what you need and we&apos;ll be in touch.</p>
            </div>
            <a
              href={ctaUrl}
              className={buttonVariants({ size: "lg", className: "bg-marigold px-4 text-on-marigold hover:bg-marigold/90" })}
            >
              Get started
              <ArrowRight data-icon="inline-end" aria-hidden />
            </a>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have a workspace?{" "}
            <Link href="/find-workspace" className="text-primary underline-offset-4 hover:underline">
              Find it here
            </Link>
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} {PRODUCT_NAME}</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
            <Link href="/legal/terms" className="hover:text-foreground hover:underline">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
