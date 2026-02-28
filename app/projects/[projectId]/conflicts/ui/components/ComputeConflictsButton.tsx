"use client";

import * as React from "react";

type Mode = "compute" | "recompute";

export function ComputeConflictsButton({
  onCompute,
  loading,
  mode = "recompute",
}: {
  onCompute: () => void | Promise<void>;
  loading: boolean;
  mode?: Mode;
}) {
  const label = loading
    ? "Computing…"
    : mode === "compute"
      ? "Compute"
      : "Recompute / Refresh";

  return (
    <button
      type="button"
      className="rounded-2xl border px-4 py-2 text-sm font-medium disabled:opacity-60"
      onClick={() => void onCompute()}
      disabled={loading}
      aria-busy={loading}
    >
      {label}
    </button>
  );
}