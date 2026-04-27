// app/api/projects/[projectId]/delete/route.ts
//
// POST /api/projects/[projectId]/delete
//
// Soft-deletes a project and all its child records.
// Only the project owner may call this.
// Sets deleted_at, deleted_by, purge_after on the project and all children.
// Writes an audit log entry.
// Sends a post-deletion confirmation email to the owner.

import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { supabaseServer } from '@/lib/supabaseServer'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'ShowFlows <notifications@showflows.net>'

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

function extractProjectId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  // /api/projects/[projectId]/delete  →  parts[2]
  if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'projects') {
    return parts[2] ?? null
  }
  return null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function buildDeletionEmail({
  ownerEmail,
  projectName,
  deletedByEmail,
  deletedAt,
  purgeAfter,
  recoveryDays,
}: {
  ownerEmail: string
  projectName: string
  deletedByEmail: string
  deletedAt: string
  purgeAfter: string
  recoveryDays: number
}) {
  const subject = `${projectName} has been deleted — restore available until ${formatDate(purgeAfter)}`

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="margin-bottom:24px">
        <img src="https://showflows.net/logo.png" alt="ShowFlows" width="120" style="display:block" />
      </div>

      <h2 style="font-size:20px;font-weight:700;margin:0 0 8px 0;color:#111">
        Project deleted
      </h2>

      <p style="color:#555;font-size:15px;margin:0 0 20px 0">
        The project <strong>${projectName}</strong> was deleted by <strong>${deletedByEmail}</strong>
        on ${formatDate(deletedAt)}.
      </p>

      <div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px 0;font-size:14px;color:#333">
          <strong>Recovery window:</strong> ${recoveryDays} days
        </p>
        <p style="margin:0 0 8px 0;font-size:14px;color:#333">
          <strong>Recoverable until:</strong> ${formatDate(purgeAfter)}
        </p>
        <p style="margin:0;font-size:14px;color:#888">
          After this date, the project and all its data will be permanently deleted.
        </p>
      </div>

      <p style="color:#555;font-size:15px;margin:0 0 16px 0">
        To restore this project, sign in to ShowFlows and go to
        <strong>Project Settings → Recently Deleted</strong> before the recovery deadline.
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">

      <p style="color:#aaa;font-size:12px;margin:0">
        ShowFlows — Live show management for bands and production teams.<br>
        If you did not request this deletion, sign in immediately and restore the project.
      </p>
    </div>
  `

  return { subject, html }
}

export async function POST(req: Request) {
  try {
    const projectId = extractProjectId(req.nextUrl?.pathname ?? new URL(req.url).pathname)
    if (!projectId) return json(400, { ok: false, error: 'Missing project ID.' })

    // ── AuthN ──────────────────────────────────────────────────
    const supabase = await supabaseSSR()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json(401, { ok: false, error: 'Authentication required.' })

    // ── AuthZ — owner only ─────────────────────────────────────
    // projects.owner is a direct UUID column (confirmed from RLS policies)
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, owner')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (projErr) return json(500, { ok: false, error: projErr.message })
    if (!project) return json(404, { ok: false, error: 'Project not found.' })
    if (project.owner !== user.id) return json(403, { ok: false, error: 'Only the project owner can delete a project.' })

    // ── Determine recovery window ──────────────────────────────
    const sb = supabaseServer()

    const { data: recoveryData } = await sb
      .rpc('recovery_days_for_project', { p_project_id: projectId })
    const recoveryDays: number = recoveryData ?? 14

    const now = new Date()
    const purgeAfter = new Date(now.getTime() + recoveryDays * 24 * 60 * 60 * 1000)
    const deletedAt = now.toISOString()
    const purgeAfterIso = purgeAfter.toISOString()

    const softDeleteFields = {
      deleted_at: deletedAt,
      deleted_by: user.id,
      purge_after: purgeAfterIso,
    }

    // ── Soft-delete project ────────────────────────────────────
    const { error: projDeleteErr } = await sb
      .from('projects')
      .update(softDeleteFields)
      .eq('id', projectId)

    if (projDeleteErr) return json(500, { ok: false, error: `Failed to delete project: ${projDeleteErr.message}` })

    // ── Cascade soft-delete all child records ──────────────────
    // Each child table shares the same deleted_at timestamp so restore
    // can match them as a batch.

    const childTables = ['shows', 'people', 'roles', 'venues', 'providers', 'project_songs'] as const

    for (const table of childTables) {
      const { error: childErr } = await sb
        .from(table)
        .update(softDeleteFields)
        .eq('project_id', projectId)
        .is('deleted_at', null)  // don't overwrite previously-deleted records

      if (childErr) {
        console.error(`Failed to soft-delete ${table}:`, childErr.message)
        // Non-fatal — project is already soft-deleted. Log and continue.
      }
    }

    // ── Write audit log ────────────────────────────────────────
    await sb.from('deletion_audit_log').insert({
      actor_user_id: user.id,
      project_id: projectId,
      entity_type: 'project',
      entity_id: projectId,
      entity_name: project.name,
      action: 'deleted',
      deleted_at: deletedAt,
      purge_after: purgeAfterIso,
    })

    // ── Send confirmation email ────────────────────────────────
    const ownerEmail = user.email ?? ''
    if (ownerEmail) {
      const { subject, html } = buildDeletionEmail({
        ownerEmail,
        projectName: project.name,
        deletedByEmail: ownerEmail,
        deletedAt,
        purgeAfter: purgeAfterIso,
        recoveryDays,
      })

      try {
        await resend.emails.send({ from: FROM, to: [ownerEmail], subject, html })
      } catch (emailErr: any) {
        console.error('Failed to send deletion confirmation email:', emailErr)
        // Non-fatal — deletion succeeded, email is best-effort
      }
    }

    return json(200, {
      ok: true,
      projectId,
      projectName: project.name,
      deletedAt,
      purgeAfter: purgeAfterIso,
      recoveryDays,
    })
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}
