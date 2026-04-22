import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status });
}

function extractProjectIdFromPath(pathname: string): string | null {
  // Expected:
  // /api/projects/<uuid>/computed-conflicts-enriched
  const parts = pathname.split("/").filter(Boolean);
  // ["api","projects","<uuid>","computed-conflicts-enriched"]
  if (parts.length >= 4 && parts[0] === "api" && parts[1] === "projects") {
    return parts[2] ?? null;
  }
  return null;
}

function uniq(ids: (string | null | undefined)[]) {
  return Array.from(new Set(ids.filter(Boolean))) as string[];
}

type ConflictRow = {
  id: string;
  project_id: string;
  run_id: string;
  conflict_type: string;
  severity: number;
  show_id: string | null;
  other_show_id: string | null;
  person_id: string | null;
  role_id: string | null;
  title: string;
  detail: any;
  created_at: string;
};

type ShowRow = {
  id: string;
  title: string;
  venue: string | null;
  city: string | null;
  load_in_at: string | null;
  starts_at: string;
  ends_at: string;
  provider_id: string | null;
};

type PersonRow = { id: string; display_name: string };
type RoleRow = { id: string; name: string };
type ProviderRow = { id: string; name: string; provider_type: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = extractProjectIdFromPath(url.pathname);

  if (!projectId) {
    return json(400, { error: "Missing projectId in URL path" });
  }

  const runId = url.searchParams.get("runId");

  const rangeStart = url.searchParams.get("rangeStart");
  const rangeEnd = url.searchParams.get("rangeEnd");
  const computedVersionRaw = url.searchParams.get("computedVersion");

  const supabase = await supabaseSSR();

  // Force session read
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json(401, { error: "Authentication required" });
  }

  // Resolve run (either by runId, or by latest run matching range+version)
  let resolvedRunId: string | null = null;
  let runRow: any | null = null;

  if (runId) {
    resolvedRunId = runId;

    const { data, error } = await supabase
      .from("conflict_compute_runs")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", runId)
      .maybeSingle();

    if (error) return json(403, { error: error.message });
    runRow = data ?? null;
  } else {
    // Range mode
    if (!rangeStart || !rangeEnd) {
      return json(400, {
        error:
          "Provide either runId, or rangeStart + rangeEnd (and optional computedVersion).",
      });
    }

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return json(400, {
        error: "rangeStart and rangeEnd must be valid ISO timestamps",
      });
    }
    if (start >= end) {
      return json(400, { error: "rangeStart must be < rangeEnd" });
    }

    const computedVersion = computedVersionRaw ? Number(computedVersionRaw) : 1;
    if (!Number.isFinite(computedVersion) || computedVersion < 1) {
      return json(400, { error: "computedVersion must be a positive number" });
    }

    // Find latest run for EXACT same range/version (matches RPC idempotency keys)
    const { data: runs, error: runErr } = await supabase
      .from("conflict_compute_runs")
      .select("*")
      .eq("project_id", projectId)
      .eq("computed_version", computedVersion)
      .eq("range_start", start.toISOString())
      .eq("range_end", end.toISOString())
      .order("computed_at", { ascending: false })
      .limit(1);

    if (runErr) return json(403, { error: runErr.message });

    runRow = (runs ?? [])[0] ?? null;
    resolvedRunId = runRow?.id ?? null;

    // No run yet for that range/version
    if (!resolvedRunId) {
      return json(200, {
        projectId,
        run: null,
        conflicts: [],
        lookups: { shows: {}, people: {}, roles: {}, providers: {} },
      });
    }
  }

  // Fetch conflicts for the resolved run
  const { data: conflicts, error: conflictsErr } = await supabase
    .from("computed_conflicts")
    .select("*")
    .eq("project_id", projectId)
    .eq("run_id", resolvedRunId)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });

  if (conflictsErr) return json(403, { error: conflictsErr.message });

  const conflictRows = (conflicts ?? []) as ConflictRow[];

  // Collect lookup IDs
  const showIds = uniq([
    ...conflictRows.map((c) => c.show_id),
    ...conflictRows.map((c) => c.other_show_id),
  ]);
  const personIds = uniq(conflictRows.map((c) => c.person_id));
  const roleIds = uniq(conflictRows.map((c) => c.role_id));

  // Fetch shows (and provider_id from shows)
  const { data: shows, error: showsErr } = showIds.length
    ? await supabase
        .from("shows")
        .select("id,title,venue_id,load_in_at,starts_at,ends_at,provider_id")
        .eq("project_id", projectId)
        .in("id", showIds)
    : { data: [], error: null as any };

  if (showsErr) return json(403, { error: showsErr.message });

  const showRows = (shows ?? []) as ShowRow[];
  const providerIds = uniq(showRows.map((s) => s.provider_id));

  const [
    { data: people, error: peopleErr },
    { data: roles, error: rolesErr },
    { data: providers, error: providersErr },
  ] = await Promise.all([
    personIds.length
      ? supabase
          .from("people")
          .select("id,display_name")
          .eq("project_id", projectId)
          .in("id", personIds)
      : Promise.resolve({ data: [], error: null as any }),
    roleIds.length
      ? supabase
          .from("roles")
          .select("id,name")
          .eq("project_id", projectId)
          .in("id", roleIds)
      : Promise.resolve({ data: [], error: null as any }),
    providerIds.length
      ? supabase
          .from("providers")
          .select("id,name,provider_type")
          .eq("project_id", projectId)
          .in("id", providerIds)
      : Promise.resolve({ data: [], error: null as any }),
  ]);

  if (peopleErr) return json(403, { error: peopleErr.message });
  if (rolesErr) return json(403, { error: rolesErr.message });
  if (providersErr) return json(403, { error: providersErr.message });

  const showMap: Record<string, ShowRow> = Object.fromEntries(
    showRows.map((s) => [s.id, s])
  );
  const peopleMap: Record<string, PersonRow> = Object.fromEntries(
    (people ?? []).map((p: any) => [p.id, p])
  );
  const roleMap: Record<string, RoleRow> = Object.fromEntries(
    (roles ?? []).map((r: any) => [r.id, r])
  );
  const providerMap: Record<string, ProviderRow> = Object.fromEntries(
    (providers ?? []).map((p: any) => [p.id, p])
  );

  return json(200, {
    projectId,
    run: runRow,
    conflicts: conflictRows,
    lookups: {
      shows: showMap,
      people: peopleMap,
      roles: roleMap,
      providers: providerMap,
    },
  });
}