import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { headers } from 'next/headers'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    // Accept both camelCase (client) and snake_case (db-ish) inputs
    const projectId = body.projectId ?? body.project_id
    const invitedEmailRaw = body.invitedEmail ?? body.invited_email
    const role = body.role as Role | undefined
    const isManaged = body.isManaged ?? body.is_managed ?? false

    const invitedEmail =
      typeof invitedEmailRaw === 'string' ? invitedEmailRaw.trim().toLowerCase() : ''

    if (!projectId || !invitedEmail || !role) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing fields.',
          expected: ['projectId (or project_id)', 'invitedEmail (or invited_email)', 'role'],
          got: Object.keys(body ?? {}),
        },
        { status: 400 }
      )
    }

    const h = await headers()

    // ---- AuthN: require bearer token ----
    const authHeader = h.get('authorization') || ''
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''

    if (!bearer) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated (missing Authorization: Bearer token).' },
        { status: 401 }
      )
    }

    // Server-side Supabase client (service role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Validate user from bearer token
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer)
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, error: 'Invalid session. Please log in again.' },
        { status: 401 }
      )
    }

    const actorEmail = (userData.user.email || '').trim().toLowerCase()
    if (!actorEmail) {
      return NextResponse.json(
        { ok: false, error: 'Your user account has no email. Cannot authorize.' },
        { status: 401 }
      )
    }

    // ---- AuthZ: only owner/editor can invite ----
    const { data: memberRow, error: memberErr } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('member_email', actorEmail)
      .maybeSingle()

    if (memberErr) {
      return NextResponse.json(
        { ok: false, error: `Permission check failed: ${memberErr.message}` },
        { status: 500 }
      )
    }

    const actorRole = (memberRow?.role as Role | undefined) ?? undefined
    const canInvite = actorRole === 'owner' || actorRole === 'editor'

    if (!canInvite) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: you do not have permission to invite members.' },
        { status: 403 }
      )
    }

    // Create invite token + expiry
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString() // 7 days

    const { data: inviteRow, error: insertErr } = await supabase
      .from('project_invites')
      .insert({
        project_id: projectId,
        invited_email: invitedEmail,
        role,
        is_managed: !!isManaged,
        token,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single()

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }

    // Build link (works locally + later when deployed)
    const origin = h.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const inviteUrl = `${origin}/invite/${token}`

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY!
    const resendFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    const resend = new Resend(resendKey)

    const { error: emailErr } = await resend.emails.send({
      from: resendFrom,
      to: invitedEmail,
      subject: 'You’ve been invited to a ShowFlows project',
      html: `
        <p>You’ve been invited to join a project in <b>ShowFlows</b>.</p>
        <p><a href="${inviteUrl}">Click here to accept your invite</a></p>
        <p>This link expires in 7 days.</p>
      `,
    })

    if (emailErr) {
      // Invite exists; allow testing by returning the URL
      return NextResponse.json({
        ok: true,
        data: { id: inviteRow.id, token: inviteRow.token, inviteUrl },
        warning: `Invite created but email not sent: ${emailErr.message}`,
      })
    }

    return NextResponse.json({ ok: true, data: { id: inviteRow.id, token: inviteRow.token } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}