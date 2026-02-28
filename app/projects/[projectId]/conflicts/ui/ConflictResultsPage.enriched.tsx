"use client";

import * as React from "react";
import { ConflictRangePicker } from "./components/ConflictRangePicker";
import { ComputeConflictsButton } from "./components/ComputeConflictsButton";
import { ConflictSummary } from "./components/ConflictSummary";
import { ConflictGroupList } from "./components/ConflictGroupList";
import { mapEnrichedToViewModel } from "@/lib/conflicts/conflictReadModel.enriched";

type Props = { projectId: string };

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: any; lastLoadedAt: string };

type SeverityFilter = "all" | "Critical" | "Warning" | "Info";

function isoNowPlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function isoNowMinusMinutes(mins: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - mins);
  return d.toISOString();
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs",
        active ? "bg-foreground text-background" : "bg-background",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

async function getEnrichedByRange(args: {
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  computedVersion: number;
}) {
  const qs = new URLSearchParams({
    rangeStart: args.rangeStart,
    rangeEnd: args.rangeEnd,
    computedVersion: String(args.computedVersion),
  });

  const res = await fetch(
    `/api/projects/${args.projectId}/computed-conflicts-enriched?${qs.toString()}`,
    { method: "GET" }
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: payload?.error ?? "Request failed" };
  }
  return { ok: true as const, payload };
}

async function getEnrichedByRunId(args: { projectId: string; runId: string }) {
  const qs = new URLSearchParams({ runId: args.runId });

  const res = await fetch(
    `/api/projects/${args.projectId}/computed-conflicts-enriched?${qs.toString()}`,
    { method: "GET" }
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: payload?.error ?? "Request failed" };
  }
  return { ok: true as const, payload };
}

async function postCompute(args: {
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  computedVersion: number;
}) {
  const res = await fetch(`/api/projects/${args.projectId}/compute-conflicts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
      computedVersion: args.computedVersion,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: payload?.error ?? "Request failed" };
  }
  return { ok: true as const, runId: payload?.runId as string };
}

export default function ConflictResultsPageEnriched({ projectId }: Props) {
  const [computedVersion] = React.useState<number>(1);
  const [rangeStart, setRangeStart] = React.useState<string>(() => isoNowMinusMinutes(5));
  const [rangeEnd, setRangeEnd] = React.useState<string>(() => isoNowPlusDays(30));
  const [state, setState] = React.useState<LoadState>({ kind: "idle" });
  const [filter, setFilter] = React.useState<SeverityFilter>("all");

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    const r = await getEnrichedByRange({ projectId, rangeStart, rangeEnd, computedVersion });

    if (!r.ok) {
      if (r.status === 403) return setState({ kind: "locked", message: r.error });
      if (r.status === 401) return setState({ kind: "error", message: "Please log in again." });
      return setState({ kind: "error", message: r.error });
    }

    setState({ kind: "ready", payload: r.payload, lastLoadedAt: new Date().toISOString() });
  }, [projectId, rangeStart, rangeEnd, computedVersion]);

  React.useEffect(() => void load(), [load]);

  const onCompute = React.useCallback(async () => {
    setState({ kind: "loading" });

    const c = await postCompute({ projectId, rangeStart, rangeEnd, computedVersion });
    if (!c.ok) {
      if (c.status === 403) return setState({ kind: "locked", message: c.error });
      return setState({ kind: "error", message: c.error });
    }

    const r = await getEnrichedByRunId({ projectId, runId: c.runId });
    if (!r.ok) {
      if (r.status === 403) return setState({ kind: "locked", message: r.error });
      return setState({ kind: "error", message: r.error });
    }

    setState({ kind: "ready", payload: r.payload, lastLoadedAt: new Date().toISOString() });
  }, [projectId, rangeStart, rangeEnd, computedVersion]);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xl font-semibold">Conflict Intelligence</div>
        <div className="text-sm text-muted-foreground">Pro-only results · Range-based compute</div>
        {state.kind === "ready" && (
          <div className="text-xs text-muted-foreground mt-1">
            Last updated: {new Date(state.lastLoadedAt).toLocaleString()}
          </div>
        )}
      </div>
      <ComputeConflictsButton onCompute={onCompute} loading={state.kind === "loading"} />
    </div>
  );

  if (state.kind === "locked") {
    return (
      <div className="p-4 space-y-4">
        {header}
        <div className="rounded-2xl border p-4">
          <div className="font-semibold">Upgrade to Pro to see conflicts</div>
          <div className="text-sm text-muted-foreground mt-1">
            Free tier keeps full planning. Pro adds the “second brain” intelligence layer.
          </div>
          <div className="text-xs text-muted-foreground mt-3">Details: {state.message}</div>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="p-4 space-y-4">
        {header}
        <div className="rounded-2xl border p-4">
          <div className="font-semibold">Couldn’t load conflicts</div>
          <div className="text-sm text-muted-foreground mt-1">{state.message}</div>
          <button className="mt-4 rounded-xl border px-4 py-2 text-sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const payload = state.kind === "ready" ? state.payload : { run: null, conflicts: [], lookups: {} };
  const vm0 = mapEnrichedToViewModel(payload);

  // Apply severity filter (client-side)
  const groups =
    filter === "all"
      ? vm0.groups
      : vm0.groups
          .map((g) => ({ ...g, items: g.items.filter((x) => x.severityLabel === filter) }))
          .filter((g) => g.items.length > 0);

  const vm = { summary: vm0.summary, groups };

  return (
    <div className="p-4 space-y-4">
      {header}

      <ConflictRangePicker
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onChange={(next) => {
          setRangeStart(next.rangeStart);
          setRangeEnd(next.rangeEnd);
        }}
      />

      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground mr-2">Filter:</div>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        <Chip active={filter === "Critical"} onClick={() => setFilter("Critical")}>
          Critical
        </Chip>
        <Chip active={filter === "Warning"} onClick={() => setFilter("Warning")}>
          Warning
        </Chip>
        <Chip active={filter === "Info"} onClick={() => setFilter("Info")}>
          Info
        </Chip>
      </div>

      <ConflictSummary summary={vm.summary} />

      <ConflictGroupList
        groups={vm.groups}
        emptyHint={
          payload.run
            ? "No conflicts found for this computed run."
            : "Compute conflicts for this range to see results."
        }
      />
    </div>
  );
}