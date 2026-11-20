"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { ENTITY_LINKS, type EntityLinkVariant } from "@/lib/entity-links";

type NotificationRow = {
  id: string;
  message: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: Date;
};

export function NotificationBell({ variant = "staff" }: { variant?: EntityLinkVariant }) {
  const entityLinks = ENTITY_LINKS[variant];
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Ids already seen in this tab, so only notifications that arrive while it's
  // open pop up (null until the first load: nothing pops up on page load).
  const seen = useRef<Set<string> | null>(null);

  async function refresh(options?: { silent?: boolean }) {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications");
      const { count, notifications } = (await res.json()) as { count: number; notifications: NotificationRow[] };
      if (seen.current) {
        const fresh = notifications.filter((n) => !n.read && !seen.current!.has(n.id));
        // A burst (several at once) becomes one pop-up instead of a stack.
        if (fresh.length === 1) {
          const n = fresh[0];
          const href = entityLinks[n.entityType]?.(n.entityId);
          toast(n.message, href ? { action: { label: "Open", onClick: () => handleClickNotification(n.id, href) } } : undefined);
        } else if (fresh.length > 1) {
          toast(`${fresh.length} new notifications`, { action: { label: "Show", onClick: () => setOpen(true) } });
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...notifications.map((n) => n.id)]);
      setUnread(count);
      setNotifications(notifications);
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "Failed to load notifications");
      }
    }
  }

  const poll = useEffectEvent(() => refresh({ silent: true }));
  useEffect(() => {
    const initial = setTimeout(poll, 0);
    const interval = setInterval(poll, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) refresh();
  }

  function handleClickNotification(id: string, goTo?: string) {
    // The list stays open over the page otherwise, which on a phone looks
    // like the tap did nothing.
    setOpen(false);
    if (goTo) router.push(goTo);
    startTransition(async () => {
      try {
        await markNotificationRead(id);
        refresh({ silent: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to mark notification read");
      }
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        refresh({ silent: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to mark all as read");
      }
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="relative" data-tour="notifications">
            <Bell className="size-4" />
            {unread > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1">
                {unread > 9 ? "9+" : unread}
              </Badge>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={handleMarkAll} loading={isPending}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet</p>
          )}
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={entityLinks[n.entityType]?.(n.entityId) ?? "/"}
              onClick={() => handleClickNotification(n.id)}
              className={`block border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted ${n.read ? "text-muted-foreground" : "font-medium"}`}
            >
              <p>{n.message}</p>
              <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
