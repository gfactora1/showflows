// app/api/projects/[projectId]/restore/route.ts
//
// POST /api/projects/[projectId]/restore
//
// Restores a soft-deleted project and all child records deleted in the same batch.
// Only the project owner may call this.
// Fails if purge_after has already passed (recovery window expired).
// Writes an audit log entry.

import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { supabaseServer } from '@/lib/supabaseServer'

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

function extractProjectId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  // /api/projects/[projectId]/restore  →  parts[2]
  if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'projects') {
    return parts[2] ?? null
  }
  return null
}

export async function POST(req: Request) {
  try {
    const projectId = extractProjectId(req.nextUrl?.pathname ?? new URL(req.url).pathname)
    if (!projectId) return json(400, { ok: false, error: 'Missing project ID.' })

    // ── AuthN ──────────────────────────────────────────────────
    const supabase = await supabaseSSR()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json(401, { ok: false, error: 'Authentication required.' })

    // ── Fetch the deleted project (service role — bypasses RLS which filters deleted_at IS NULL) ──
    const sb = supabaseServer()

    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id, name, owner, deleted_at, purge_after')
      .eq('id', projectId)
      .not('deleted_at', 'is', null)   // must actually be soft-deleted
      .maybeSingle()

    if (projErr) return json(500, { ok: false, error: projErr.message })
    if (!project) return json(404, { ok: false, error: 'Deleted project not found.' })

    // ── AuthZ — owner only ─────────────────────────────────────
    if (project.owner !== user.id) {
      return json(403, { ok: false, error: 'Only the project owner can restore a project.' })
    }

    // ── Check recovery window ──────────────────────────────────
    if (!project.purge_after || new Date(project.purge_after) < new Date()) {
      return json(410, {
        ok: false,
        error: 'Recovery window has expired. This project can no longer be restored.',
      })
    }

    // ── Capture the deleted_at timestamp to match child records ─
    // Children deleted in the same batch share the same deleted_at value.
    // We restore only those — not records deleted individually before the project was deleted.
    const batchDeletedAt = project.deleted_at

    const restoreFields = {
      deleted_at: null,
      deleted_by: null,
      purge_after: null,
    }

    // ── Restore project ────────────────────────────────────────
    const { error: projRestoreErr } = await sb
      .from('projects')
      .update(restoreFields)
      .eq('id', projectId)

    if (projRestoreErr) {
      return json(500, { ok: false, error: `Failed to restore project: ${projRestoreErr.message}` })
    }

    // ── Restore child records from the same deletion batch ─────
    const childTables = ['shows', 'people', 'roles', 'venues', 'providers', 'project_songs'] as const

    for (const table of childTables) {
      const { error: childErr } = await sb
        .from(table)
        .update(restoreFields)
        .eq('project_id', projectId)
        .eq('deleted_at', batchDeletedAt)   // only restore records from this batch

      if (childErr) {
        console.error(`Failed to restore ${table}:`, childErr.message)
        // Non-fatal — project is restored. Log and continue.
      }
    }

    // ── Write audit log ────────────────────────────────────────
    await sb.from('deletion_audit_log').insert({
      actor_user_id: user.id,
      project_id: projectId,
      entity_type: 'project',
      entity_id: projectId,
      entity_name: project.name,
      action: 'restored',
      restored_at: new Date().toISOString(),
    })

    return json(200, {
      ok: true,
      projectId,
      projectName: project.name,
    })
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}
