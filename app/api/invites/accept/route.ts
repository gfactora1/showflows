// app/api/invites/lookup/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body?.token ?? '').trim()

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured (missing Supabase env vars).' },
        { status: 500 }
      )
    }

    const sb = createClient(supabaseUrl, serviceKey)

    // 1) Fetch invite by token
    const { data: inv, error: invErr } = await sb
      .from('project_invites')
      .select('id, project_id, invited_email, role, is_managed, expires_at, accepted_at')
      .eq('token', token)
      .maybeSingle()

    if (invErr) {
      return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 })
    }

    if (!inv) {
      return NextResponse.json({ ok: false, error: 'Invalid invite token.' }, { status: 404 })
    }

    // 2) Fetch project name (for nicer UI)
    const { data: proj, error: projErr } = await sb
      .from('projects')
      .select('name')
      .eq('id', inv.project_id)
      .maybeSingle()

    if (projErr) {
      return NextResponse.json({ ok: false, error: projErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...inv,
        project_name: proj?.name ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}