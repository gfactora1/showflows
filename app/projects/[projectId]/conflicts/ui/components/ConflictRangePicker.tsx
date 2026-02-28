"use client";

import * as React from "react";

export function ConflictRangePicker({
  rangeStart,
  rangeEnd,
  onChange,
}: {
  rangeStart: string;
  rangeEnd: string;
  onChange: (next: { rangeStart: string; rangeEnd: string }) => void;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const startLabel = React.useMemo(() => {
    if (!mounted) return "";
    const d = new Date(rangeStart);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }, [mounted, rangeStart]);

  const endLabel = React.useMemo(() => {
    if (!mounted) return "";
    const d = new Date(rangeEnd);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }, [mounted, rangeEnd]);

  return (
    <div className="rounded-2xl border p-4 flex items-center justify-between gap-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold">Range</div>

        {/* Hydration-safe: server renders empty string, client fills after mount */}
        <div className="text-xs text-muted-foreground" suppressHydrationWarning>
          {mounted ? (
            <>
              {startLabel} → {endLabel}
            </>
          ) : (
            "—"
          )}
        </div>
      </div>

      {/* Your existing quick-range buttons / controls can stay below.
          If you already have them in this component, keep them — this file only
          changes the date-label rendering to avoid hydration errors. */}
    </div>
  );
}