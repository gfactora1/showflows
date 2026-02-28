"use client";

import * as React from "react";
import { ConflictRangePicker } from "./components/ConflictRangePicker";
import { ComputeConflictsButton } from "./components/ComputeConflictsButton";
import { ConflictSummary } from "./components/ConflictSummary";
import { ConflictGroupList } from "./components/ConflictGroupList";
import { mapRowsToViewModel } from "@/lib/conflicts/conflictReadModel";

type Props = { projectId: string };

type ApiRun = {
  id: string;
  project_id: string;
  run_id: string;
  computed_version: number;
  range_start: string | null;
  range_end: string | null;
  status: string;
  computed_at: string;
  created_by_user_id: string | null;
  meta: any;
};

type ApiResponse = {
  projectId: string;
  run: ApiRun | null;
  conflicts: any[];
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: ApiResponse; lastLoadedAt: string };

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

async function getConflictsByRange(args: {
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
    `/api/projects/${args.projectId}/computed-conflicts?${qs.toString()}`,
    { method: "GET" }
  );

  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: payload?.error ?? "Request failed",
    };
  }
  return { ok: true as const, payload: payload as ApiResponse };
}

async function getConflictsByRunId(args: { projectId: string; runId: string }) {
  const qs = new URLSearchParams({ runId: args.runId });

  const res = await fetch(
    `/api/projects/${args.projectId}/computed-conflicts?${qs.toString()}`,
    { method: "GET" }
  );

  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: payload?.error ?? "Request failed",
    };
  }
  return { ok: true as const, payload: payload as ApiResponse };
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
    return {
      ok: false as const,
      status: res.status,
      error: payload?.error ?? "Request failed",
    };
  }
  return { ok: true as const, runId: payload?.runId as string };
}

function formatRunMeta(run: ApiRun | null) {
  if (!run) return "No compute run for this range yet.";
  const when = new Date(run.computed_at).toLocaleString();
  return `Last computed: ${when} · Status: ${run.status}`;
}

export default function ConflictResultsPage({ projectId }: Props) {
  const [computedVersion] = React.useState<number>(1);
  const [rangeStart, setRangeStart] = React.useState<string>(() =>
    isoNowMinusMinutes(5)
  );
  const [rangeEnd, setRangeEnd] = React.useState<string>(() => isoNowPlusDays(30));
  const [state, setState] = React.useState<LoadState>({ kind: "idle" });

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    const r = await getConflictsByRange({
      projectId,
      rangeStart,
      rangeEnd,
      computedVersion,
    });

    if (!r.ok) {
      if (r.status === 403) return setState({ kind: "locked", message: r.error });
      if (r.status === 401)
        return setState({ kind: "error", message: "Please log in again." });
      return setState({ kind: "error", message: r.error });
    }

    setState({
      kind: "ready",
      payload: r.payload,
      lastLoadedAt: new Date().toISOString(),
    });
  }, [projectId, rangeStart, rangeEnd, computedVersion]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCompute = React.useCallback(async () => {
    setState({ kind: "loading" });

    const c = await postCompute({ projectId, rangeStart, rangeEnd, computedVersion });
    if (!c.ok) {
      if (c.status === 403) {
        setState({ kind: "locked", message: c.error });
        return;
      }
      setState({ kind: "error", message: c.error });
      return;
    }

    // compute_conflicts_pro returns a runId; fetch conflicts by that runId immediately
    const r = await getConflictsByRunId({ projectId, runId: c.runId });
    if (!r.ok) {
      if (r.status === 403) return setState({ kind: "locked", message: r.error });
      return setState({ kind: "error", message: r.error });
    }

    setState({
      kind: "ready",
      payload: r.payload,
      lastLoadedAt: new Date().toISOString(),
    });
  }, [projectId, rangeStart, rangeEnd, computedVersion]);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xl font-semibold">Conflict Intelligence</div>
        <div className="text-sm text-muted-foreground">
          Pro-only results · Range-based compute
        </div>
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
          <button
            className="mt-4 rounded-xl border px-4 py-2 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const payload: ApiResponse =
    state.kind === "ready"
      ? state.payload
      : { projectId, run: null, conflicts: [] };

  const vm = mapRowsToViewModel(payload.conflicts);

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

      <div className="rounded-2xl border p-3 text-xs text-muted-foreground">
        {formatRunMeta(payload.run)}
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

      {state.kind === "ready" && (
        <div className="text-xs text-muted-foreground">
          Last loaded: {new Date(state.lastLoadedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}