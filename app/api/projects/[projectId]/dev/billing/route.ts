import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  plan: "free" | "pro";
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  // Hard block in production — no accidental backdoor.
  if (process.env.NODE_ENV === "production") {
    return jsonError("Not found", 404);
  }

  const { projectId } = await context.params;

  // Parse JSON body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!body?.plan || (body.plan !== "free" && body.plan !== "pro")) {
    return jsonError(`Invalid plan. Expected "free" or "pro".`, 400);
  }

  // Require authenticated user (cookie-based SSR client)
  const supabase = await supabaseSSR();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return jsonError("Unauthorized", 401);
  }

  // Verify the caller is the project owner (authoritative)
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, owner")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) {
    return jsonError(projectErr.message, 500);
  }
  if (!project) {
    return jsonError("Project not found", 404);
  }
  if (project.owner !== user.id) {
    return jsonError("Forbidden (owner only)", 403);
  }

  // Admin write to billing record (dev tool only)
  const admin = supabaseServer();
  const nowIso = new Date().toISOString();
  const oneYearFromNowIso = new Date(
    Date.now() + 1000 * 60 * 60 * 24 * 365
  ).toISOString();

  const nextPlan = body.plan;
  const nextStatus = "active";

  const { error: upsertErr } = await admin.from("project_billing").upsert(
    {
      project_id: projectId,
      billing_owner_user_id: user.id,
      plan: nextPlan,
      status: nextStatus,
      updated_at: nowIso,
      // Keep timestamps realistic. (If you have DB defaults/triggers, it’s still fine.)
      created_at: nowIso,
      current_period_start: nowIso,
      current_period_end: oneYearFromNowIso,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    },
    { onConflict: "project_id" }
  );

  if (upsertErr) {
    return jsonError(upsertErr.message, 500);
  }

  return NextResponse.json({
    ok: true,
    projectId,
    plan: nextPlan,
    status: nextStatus,
  });
}