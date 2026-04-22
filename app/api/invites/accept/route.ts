import { NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabaseSSR";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status });
}

function isValidToken(token: string) {
  return /^[0-9a-f]{48}$/i.test(token);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();

    if (!token) return json(400, { ok: false, error: "Missing token." });
    if (!isValidToken(token)) return json(400, { ok: false, error: "Invalid token format." });

    const supabase = await supabaseSSR();

    // Must be signed in as the invited email (cookie-authenticated)
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return json(401, { ok: false, error: "Authentication required." });
    }

    const { data, error } = await supabase.rpc("accept_project_invite", {
      p_token: token,
    });

    if (error) {
      return json(403, { ok: false, error: error.message });
    }

    return json(200, { ok: true, data });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Unknown error" });
  }
}