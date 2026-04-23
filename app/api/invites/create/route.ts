import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";
import { supabaseServer } from "@/lib/supabaseServer";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "ShowFlows <invites@showflows.net>";

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

function roleLabel(role: InviteRole) {
  switch (role) {
    case "editor": return "Editor";
    case "member": return "Member";
    case "readonly": return "View only";
    default: return role;
  }
}

function buildInviteEmail({
  invitedEmail,
  projectName,
  inviterEmail,
  role,
  acceptUrl,
}: {
  invitedEmail: string;
  projectName: string;
  inviterEmail: string;
  role: InviteRole;
  acceptUrl: string;
}) {
  const subject = `You've been invited to join ${projectName} on ShowFlows`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="margin-bottom:24px">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px">ShowFlows</span>
      </div>

      <h2 style="font-size:20px;font-weight:700;margin:0 0 8px 0">
        You've been invited to join a project
      </h2>

      <p style="color:#555;font-size:15px;margin:0 0 24px 0">
        <strong>${inviterEmail}</strong> has invited you to join
        <strong>${projectName}</strong> as a <strong>${roleLabel(role)}</strong>.
      </p>

      <a
        href="${acceptUrl}"
        style="
          display:inline-block;
          padding:12px 28px;
          background:#111;
          color:white;
          border-radius:8px;
          text-decoration:none;
          font-size:15px;
          font-weight:600;
          margin-bottom:24px;
        "
      >
        Accept Invitation →
      </a>

      <p style="color:#888;font-size:13px;margin:0 0 4px 0">
        Or copy this link into your browser:
      </p>
      <p style="color:#888;font-size:12px;word-break:break-all;margin:0 0 24px 0">
        ${acceptUrl}
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">

      <p style="color:#aaa;font-size:12px;margin:0">
        ShowFlows — Live show management for bands and production teams.<br>
        If you weren't expecting this invite, you can safely ignore this email.
      </p>
    </div>
  `;

  return { subject, html };
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

    // AuthN
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user || !user.email) {
      return json(401, { ok: false, error: "Authentication required." });
    }

    const actorEmail = normalizeEmail(user.email);
    const actorName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? actorEmail) as string;

    // AuthZ
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

    // Already a member?
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

    // Reuse pending invite if exists
    const { data: existingInvite, error: invLookupErr } = await supabase
      .from("project_invites")
      .select("id, token, accepted_at")
      .eq("project_id", projectId)
      .eq("invited_email", invitedEmail)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (invLookupErr) return json(500, { ok: false, error: invLookupErr.message });

    let token: string;
    let reused = false;

    if (existingInvite?.id && existingInvite?.token) {
      token = existingInvite.token;
      reused = true;
    } else {
      // Create new invite
      token = crypto.randomBytes(24).toString("hex");
      const { error: insertErr } = await supabase.from("project_invites").insert({
        project_id: projectId,
        invited_email: invitedEmail,
        role,
        is_managed: isManaged,
        token,
      });
      if (insertErr) return json(500, { ok: false, error: insertErr.message });
    }

    // Pull project name using service role (bypasses RLS)
    const sb = supabaseServer();
    const { data: projectData } = await sb
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();

    const projectName = projectData?.name ?? "a project";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const acceptUrl = `${appUrl}/invite/${token}`;

    // Send invite email
    const { subject, html } = buildInviteEmail({
      invitedEmail,
      projectName,
      inviterEmail: actorName,
      role,
      acceptUrl,
    });

    try {
      await resend.emails.send({
        from: FROM,
        to: [invitedEmail],
        subject,
        html,
      });
    } catch (emailErr: any) {
      // Don't fail the whole request if email fails — token is already created
      console.error("Failed to send invite email:", emailErr);
      return json(200, { ok: true, reused, token, warning: "Invite created but email could not be sent." });
    }

    return json(200, { ok: true, reused, token });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Unknown error" });
  }
}
