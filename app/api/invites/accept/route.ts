import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token: string }
    const t = token?.trim()
    if (!t) return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 400 })

    const sb = supabaseServer()

    // Find invite
    const { data: inv, error: invErr } = await sb
      .from('project_invites')
      .select('id, project_id, invited_email, role, is_managed, expires_at, accepted_at')
      .eq('token', t)
      .single()

    if (invErr || !inv) {
      return NextResponse.json({ ok: false, error: 'Invalid invite token.' }, { status: 404 })
    }

    if (inv.accepted_at) {
      return NextResponse.json({ ok: true, message: 'Invite already accepted.' })
    }

    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Invite expired.' }, { status: 410 })
    }

    // Create membership (email-based)
    const { error: memErr } = await sb.from('project_members').insert({
      project_id: inv.project_id,
      member_email: inv.invited_email,
      role: inv.role,
      is_managed: inv.is_managed,
    })

    if (memErr) {
      // If you later add unique constraints, you may want to treat "already exists" as ok.
      return NextResponse.json({ ok: false, error: memErr.message }, { status: 400 })
    }

    // Mark invite accepted
    const { error: updErr } = await sb
      .from('project_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id)

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}