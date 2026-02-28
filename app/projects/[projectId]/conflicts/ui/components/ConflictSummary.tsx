"use client";

import * as React from "react";

export type ConflictSummaryModel = {
  total: number;
  critical: number;
  warning: number;
  info: number;
};

export function ConflictSummary({ summary }: { summary: ConflictSummaryModel }) {
  return (
    <div className="rounded-2xl border p-3">
      <div className="text-sm font-medium mb-2">Summary</div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border px-3 py-1">Total: {summary.total}</span>
        <span className="rounded-full border px-3 py-1">Critical: {summary.critical}</span>
        <span className="rounded-full border px-3 py-1">Warning: {summary.warning}</span>
        <span className="rounded-full border px-3 py-1">Info: {summary.info}</span>
      </div>
    </div>
  );
}