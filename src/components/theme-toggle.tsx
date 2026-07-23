"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const CYCLE = ["light", "dark", "system"] as const;
const ICONS = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const current = (mounted ? theme : "system") as (typeof CYCLE)[number];
  const Icon = ICONS[current] ?? Monitor;

  function handleClick() {
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    setTheme(next);
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} title={`Theme: ${current}`}>
      <Icon className="size-4" />
    </Button>
  );
}
