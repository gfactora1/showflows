import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";
import crypto from "crypto";

type Role = "owner" | "editor" | "member" | "readonly";
type InviteRole = Exclude<Role, "owner">;

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status });
}

function normalizeEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function isValidEmail(v: string) {
  return v.includes("@") && v.includes(".") && v.length >= 6;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const projectId = String(body.projectId ?? body.project_id ?? "").trim();
    const invitedEmail = normalizeEmail(body.invitedEmail ?? body.invited_email);
    const role = body.role as InviteRole | undefined;
    const isManaged = Boolean(body.isManaged ?? body.is_managed ?? false);

    if (!projectId || !invitedEmail || !role) {
      return json(400, { ok: false, error: "Missing required fields." });
    }
    if (!isValidEmail(invitedEmail)) {
      return json(400, { ok: false, error: "Invalid email address." });
    }
    if (role === "owner") {
      return json(400, { ok: false, error: 'Invalid role. "owner" cannot be invited.' });
    }

    const supabase = await supabaseSSR();

    // AuthN (cookie session)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user || !user.email) {
      return json(401, { ok: false, error: "Authentication required." });
    }

    const actorEmail = normalizeEmail(user.email);

    // AuthZ: only owner/editor can invite (RLS-backed)
    const { data: memberRow, error: memberErr } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_email", actorEmail)
      .maybeSingle();

    if (memberErr) return json(500, { ok: false, error: memberErr.message });

    const actorRole = memberRow?.role as Role | undefined;
    if (actorRole !== "owner" && actorRole !== "editor") {
      return json(403, { ok: false, error: "Forbidden: insufficient permissions." });
    }

    // 1) If already a member => 409
    const { data: existingMember, error: memLookupErr } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("member_email", invitedEmail)
      .maybeSingle();

    if (memLookupErr) return json(500, { ok: false, error: memLookupErr.message });

    if (existingMember?.id) {
      return json(409, { ok: false, error: "That email is already a member of this project." });
    }

    // 2) Reuse a pending invite if it exists (idempotency)
    const { data: existingInvite, error: invLookupErr } = await supabase
      .from("project_invites")
      .select("id, token, accepted_at")
      .eq("project_id", projectId)
      .eq("invited_email", invitedEmail)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (invLookupErr) return json(500, { ok: false, error: invLookupErr.message });

    if (existingInvite?.id && existingInvite?.token) {
      // Optionally: you could update role/is_managed here if you want “latest wins”
      return json(200, { ok: true, reused: true, token: existingInvite.token });
    }

    // 3) Create a new invite
    const token = crypto.randomBytes(24).toString("hex");

    const { error: insertErr } = await supabase.from("project_invites").insert({
      project_id: projectId,
      invited_email: invitedEmail,
      role,
      is_managed: isManaged,
      token,
    });

    if (insertErr) return json(500, { ok: false, error: insertErr.message });

    return json(200, { ok: true, reused: false, token });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Unknown error" });
  }
}