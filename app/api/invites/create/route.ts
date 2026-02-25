import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { headers } from 'next/headers'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

function normalizeEmail(input: unknown) {
  return typeof input === 'string' ? input.trim().toLowerCase() : ''
}

function sanitizeFrom(fromValue: string | undefined) {
  const fallback = 'ShowFlows <invites@showflows.net>'
  const raw = (fromValue || '').trim()

  if (!raw) return fallback

  // If someone accidentally pasted "RESEND_FROM_EMAIL=ShowFlows <...>" as the value, strip it
  const stripped = raw.replace(/^RESEND_FROM_EMAIL\s*=\s*/i, '').trim()

  // Very light validation: must contain an email-ish part
  if (!stripped.includes('@') || !stripped.includes('<') || !stripped.includes('>')) {
    // allow bare email too
    if (stripped.includes('@')) return stripped
    return fallback
  }

  return stripped
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const projectId = body.projectId ?? body.project_id
    const invitedEmail = normalizeEmail(body.invitedEmail ?? body.invited_email)
    const role = body.role as Role | undefined
    const isManaged = Boolean(body.isManaged ?? body.is_managed ?? false)

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
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured (missing Supabase env vars).' },
        { status: 500 }
      )
    }
    const supabase = createClient(supabaseUrl, serviceKey)

    // Validate user from bearer token
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer)
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, error: 'Invalid session. Please log in again.' },
        { status: 401 }
      )
    }

    const actorEmail = normalizeEmail(userData.user.email)
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

    // ---- Load project name for email personalization ----
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()

    if (projErr || !proj?.name) {
      return NextResponse.json(
        { ok: false, error: `Could not load project name: ${projErr?.message ?? 'Unknown error'}` },
        { status: 500 }
      )
    }

    const projectName = proj.name

    // Build link origin (works locally + later when deployed)
    const origin = h.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    // Resend setup
    const resendKey = process.env.RESEND_API_KEY!
    if (!resendKey) {
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured (missing RESEND_API_KEY).' },
        { status: 500 }
      )
    }

    const resendFrom = sanitizeFrom(process.env.RESEND_FROM_EMAIL)
    const resend = new Resend(resendKey)

    const subject = `You're invited to join ${projectName} on ShowFlows`
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString() // 7 days

    const buildHtml = (inviteUrl: string) => `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5;">
        <p>You’ve been invited to join <b>${projectName}</b> on <b>ShowFlows</b>.</p>
        <p><a href="${inviteUrl}">Accept your invite</a></p>
        <p style="color:#666;">This link expires in 7 days.</p>
      </div>
    `

    const buildText = (inviteUrl: string) =>
      `You've been invited to join ${projectName} on ShowFlows.\n\nAccept your invite: ${inviteUrl}\n\nThis link expires in 7 days.`

    // -----------------------------
    // Idempotency: reuse pending invite if it already exists
    // -----------------------------
    const { data: existingInvite, error: existingErr } = await supabase
      .from('project_invites')
      .select('id, token')
      .eq('project_id', projectId)
      .eq('invited_email', invitedEmail)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
      .maybeSingle()

    if (existingErr) {
      return NextResponse.json(
        { ok: false, error: `Invite lookup failed: ${existingErr.message}` },
        { status: 500 }
      )
    }

    // If pending invite exists, reuse it (and extend expiry)
    if (existingInvite?.id && existingInvite?.token) {
      const token = existingInvite.token

      // Extend expiry on resend
      await supabase.from('project_invites').update({ expires_at: expiresAt }).eq('id', existingInvite.id)

      const inviteUrl = `${origin}/invite/${token}`

      const { error: emailErr } = await resend.emails.send({
        from: resendFrom,
        to: invitedEmail,
        subject,
        html: buildHtml(inviteUrl),
        text: buildText(inviteUrl),
      })

      if (emailErr) {
        return NextResponse.json({
          ok: true,
          reused: true,
          data: { id: existingInvite.id, token, inviteUrl },
          warning: `Invite already existed; tried to resend but email not sent: ${emailErr.message}`,
        })
      }

      return NextResponse.json({ ok: true, reused: true, data: { id: existingInvite.id, token } })
    }

    // -----------------------------
    // No pending invite exists — create a new one
    // -----------------------------
    const token = crypto.randomBytes(24).toString('hex')

    const { data: inviteRow, error: insertErr } = await supabase
      .from('project_invites')
      .insert({
        project_id: projectId,
        invited_email: invitedEmail,
        role,
        is_managed: isManaged,
        token,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single()

    if (insertErr || !inviteRow?.id) {
      return NextResponse.json({ ok: false, error: insertErr?.message ?? 'Invite insert failed.' }, { status: 500 })
    }

    const inviteUrl = `${origin}/invite/${token}`

    const { error: emailErr } = await resend.emails.send({
      from: resendFrom,
      to: invitedEmail,
      subject,
      html: buildHtml(inviteUrl),
      text: buildText(inviteUrl),
    })

    if (emailErr) {
      return NextResponse.json({
        ok: true,
        reused: false,
        data: { id: inviteRow.id, token: inviteRow.token, inviteUrl },
        warning: `Invite created but email not sent: ${emailErr.message}`,
      })
    }

    return NextResponse.json({ ok: true, reused: false, data: { id: inviteRow.id, token: inviteRow.token } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}