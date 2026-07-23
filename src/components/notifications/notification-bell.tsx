"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";

const ENTITY_LINK: Record<string, (id: string) => string> = {
  Task: () => "/tasks",
  Application: (id) => `/applications/${id}`,
};

type NotificationRow = {
  id: string;
  message: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: Date;
};

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function refresh() {
    const [count, list] = await Promise.all([countUnreadNotifications(), listNotifications()]);
    setUnread(count);
    setNotifications(list);
  }

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) refresh();
  }

  function handleClickNotification(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      refresh();
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="relative">
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
            <Button variant="ghost" size="xs" onClick={handleMarkAll}>
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
              href={ENTITY_LINK[n.entityType]?.(n.entityId) ?? "/"}
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
