"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox() {
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        if (q) router.push(`/search?q=${encodeURIComponent(q.toString())}`);
      }}
      className="relative w-full max-w-xs"
    >
      <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input name="q" placeholder="Search..." className="h-8 pl-7" />
    </form>
  );
}
