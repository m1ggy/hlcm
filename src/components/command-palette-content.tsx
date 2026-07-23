"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Users,
  ClipboardList,
  CheckSquare,
  UserCog,
  UserCircle,
  Clock,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { searchAll } from "@/lib/actions/search";
import { getRecentApplications } from "@/lib/recent-applications";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: FolderKanban },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare },
  { href: "/account", label: "Account", icon: UserCircle },
];

type SearchResults = Awaited<ReturnType<typeof searchAll>>;

export default function CommandPaletteContent({
  isAdmin,
  open,
  onOpenChange,
}: {
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ applications: [], clients: [], tasks: [] });
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      if (!query.trim()) {
        setResults({ applications: [], clients: [], tasks: [] });
        return;
      }
      startTransition(async () => {
        const data = await searchAll(query);
        setResults(data);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  const navItems = isAdmin ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: UserCog }] : NAV_ITEMS;
  const recents = !query.trim() ? getRecentApplications() : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette" description="Jump to a page or search">
      <Command>
        <CommandInput placeholder="Search or jump to..." value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {recents.length > 0 && (
            <CommandGroup heading="Recent">
              {recents.map((r) => (
                <CommandItem key={r.id} value={`recent-${r.name}`} onSelect={() => go(`/applications/${r.id}`)}>
                  <Clock />
                  {r.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            {navItems.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {results.applications.length > 0 && (
            <CommandGroup heading="Applications">
              {results.applications.map((app) => (
                <CommandItem key={app.id} value={`app-${app.name}`} onSelect={() => go(`/applications/${app.id}`)}>
                  <ClipboardList />
                  {app.name}
                  <span className="ml-auto text-xs text-muted-foreground">{app.client.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.clients.length > 0 && (
            <CommandGroup heading="Clients">
              {results.clients.map((client) => (
                <CommandItem key={client.id} value={`client-${client.name}`} onSelect={() => go("/clients")}>
                  <Users />
                  {client.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {results.tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task-${task.label}`}
                  onSelect={() => go(task.application ? `/applications/${task.application.id}` : "/tasks")}
                >
                  <CheckSquare />
                  {task.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
