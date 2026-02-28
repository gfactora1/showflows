import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";

type Body = {
  rangeStart: string;
  rangeEnd: string;
  computedVersion?: number;
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status });
}

function extractProjectIdFromPath(pathname: string): string | null {
  // Expected: /api/projects/<uuid>/compute-conflicts
  const parts = pathname.split("/").filter(Boolean);
  // ["api","projects","<uuid>","compute-conflicts"]
  if (parts.length >= 4 && parts[0] === "api" && parts[1] === "projects") {
    return parts[2] ?? null;
  }
  return null;
}

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const projectId = extractProjectIdFromPath(url.pathname);

  if (!projectId) {
    return json(400, { error: "Missing projectId in URL path" });
  }
  if (!looksLikeUuid(projectId)) {
    return json(400, { error: "Invalid projectId in URL path", projectId });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { rangeStart, rangeEnd } = body ?? {};
  const computedVersion =
    typeof body?.computedVersion === "number" && Number.isFinite(body.computedVersion)
      ? body.computedVersion
      : 1;

  if (!rangeStart || !rangeEnd) {
    return json(400, { error: "rangeStart and rangeEnd are required" });
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

  const supabase = await supabaseSSR();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json(401, { error: "Authentication required" });
  }

  const { data: runId, error } = await supabase.rpc("compute_conflicts_pro", {
    p_project_id: projectId,
    p_range_start: rangeStart,
    p_range_end: rangeEnd,
    p_computed_version: computedVersion,
  });

  if (error) {
    return json(403, { error: error.message });
  }

  return json(200, { runId });
}