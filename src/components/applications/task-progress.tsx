export function TaskProgress({ total, done }: { total: number; done: number }) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">No tasks</span>;
  }

  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}
