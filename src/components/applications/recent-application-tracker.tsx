"use client";

import { useEffect } from "react";
import { addRecentApplication } from "@/lib/recent-applications";

export function RecentApplicationTracker({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    addRecentApplication(id, name);
  }, [id, name]);

  return null;
}
