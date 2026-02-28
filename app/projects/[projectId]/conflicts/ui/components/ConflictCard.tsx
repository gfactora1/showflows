"use client";

import * as React from "react";

export type ConflictCardModel = {
  id: string;
  headline: string;
  severityLabel: "Critical" | "Warning" | "Info";
  windowLabel?: string;
  detail?: string;
  raw?: any; // now: detail json only
};

function severityStyles(sev: ConflictCardModel["severityLabel"]) {
  switch (sev) {
    case "Critical":
      return {
        pill: "border-red-500 bg-red-50 text-red-700",
        card: "border-red-200 bg-red-50/20",
      };
    case "Warning":
      return {
        pill: "border-amber-500 bg-amber-50 text-amber-800",
        card: "border-amber-200 bg-amber-50/20",
      };
    case "Info":
    default:
      return {
        pill: "border-blue-500 bg-blue-50 text-blue-700",
        card: "border-blue-200 bg-blue-50/20",
      };
  }
}

export function ConflictCard({ card }: { card: ConflictCardModel }) {
  const s = severityStyles(card.severityLabel);

  return (
    <div className={`rounded-2xl border p-3 space-y-1 ${s.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">{card.headline}</div>

        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.pill}`}>
          {card.severityLabel}
        </span>
      </div>

      {card.windowLabel && (
        <div className="text-xs text-muted-foreground">{card.windowLabel}</div>
      )}

      {card.detail && <div className="text-sm">{card.detail}</div>}

      {card.raw && Object.keys(card.raw ?? {}).length > 0 && (
        <details className="text-xs text-muted-foreground mt-2">
          <summary className="cursor-pointer select-none">Details</summary>
          <pre className="overflow-auto mt-2 whitespace-pre-wrap">
            {JSON.stringify(card.raw ?? {}, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}