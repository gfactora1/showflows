// app/api/projects/[projectId]/shows/[showId]/set-response/route.ts
//
// POST /api/projects/[projectId]/shows/[showId]/set-response
//
// Admin override: sets any person's availability response for a show.
// Requires editor or owner role.
//
// Body: { personId: string, response: 'pending' | 'available' | 'unavailable' | 'maybe' }
//
// When response = 'pending', responded_at is cleared to null.
// After updating, recalculates and updates shows.status.

import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { supabaseServer } from '@/lib/supabaseServer'

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

function extractIds(pathname: string): { projectId: string | null; showId: string | null } {
  const parts = pathname.split('/').filter(Boolean)
  const projectIdx = parts.indexOf('projects')
  const showIdx    = parts.indexOf('shows')
  return {
    projectId: projectIdx !== -1 ? (parts[projectIdx + 1] ?? null) : null,
    showId:    showIdx    !== -1 ? (parts[showIdx    + 1] ?? null) : null,
  }
}

const VALID_RESPONSES = ['pending', 'available', 'unavailable', 'maybe'] as const
type ResponseValue = typeof VALID_RESPONSES[number]

// ── Status recalculation ──────────────────────────────────────────────────────
// Duplicated here to keep routes self-contained.
// If this grows, extract to app/lib/availabilityStatus.ts and import from both routes.

function recalculateStatus(responses: { response: string }[]): string {
  if (responses.length === 0) return 'availability_requested'

  const counts = { available: 0, unavailable: 0, maybe: 0, pending: 0 }
  for (const r of responses) {
    const key = r.response as keyof typeof counts
    if (key in counts) counts[key]++
  }

  if (counts.unavailable > 0 || counts.maybe > 0) return 'needs_attention'
  if (counts.pending > 0) return 'availability_requested'
  return 'ready_to_confirm'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const { projectId, showId } = extractIds(url.pathname)
    if (!projectId) return json(400, { ok: false, error: 'Missing project ID.' })
    if (!showId)    return json(400, { ok: false, error: 'Missing show ID.' })

    // ── AuthN ──────────────────────────────────────────────────
    const supabase = await supabaseSSR()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json(401, { ok: false, error: 'Authentication required.' })

    // ── AuthZ — editor or owner only ──────────────────────────
    const { data: editorCheck } = await supabase
      .rpc('is_project_editor', { p_project_id: projectId })
    if (!editorCheck) return json(403, { ok: false, error: 'Insufficient permissions.' })

    // ── Parse and validate body ────────────────────────────────
    let body: { personId?: string; response?: string } = {}
    try { body = await req.json() } catch {
      return json(400, { ok: false, error: 'Invalid JSON body.' })
    }

    const { personId, response } = body

    if (!personId) {
      return json(400, { ok: false, error: 'personId is required.' })
    }
    if (!response || !VALID_RESPONSES.includes(response as ResponseValue)) {
      return json(400, {
        ok: false,
        error: `response must be one of: ${VALID_RESPONSES.join(', ')}.`,
      })
    }

    const sb = supabaseServer()

    // ── Find the active request for this show ──────────────────
    // Active = most recent request row.
    const { data: activeRequest, error: requestErr } = await sb
      .from('availability_requests')
      .select('id')
      .eq('show_id', showId)
      .eq('project_id', projectId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (requestErr) return json(500, { ok: false, error: requestErr.message })
    if (!activeRequest) {
      return json(404, {
        ok: false,
        error: 'No availability request found for this show. Send a request first.',
      })
    }

    // ── Update the response row ────────────────────────────────
    // When setting back to pending, clear responded_at.
    const updatePayload: {
      response: string
      responded_at: string | null
    } = {
      response,
      responded_at: response === 'pending' ? null : new Date().toISOString(),
    }

    const { error: updateErr } = await sb
      .from('availability_responses')
      .update(updatePayload)
      .eq('request_id', activeRequest.id)
      .eq('person_id', personId)

    if (updateErr) return json(500, { ok: false, error: updateErr.message })

    // ── Recalculate show status ────────────────────────────────
    // Load all current responses for this request to compute new status.
    const { data: allResponses, error: responsesErr } = await sb
      .from('availability_responses')
      .select('response')
      .eq('request_id', activeRequest.id)

    if (responsesErr) return json(500, { ok: false, error: responsesErr.message })

    const newStatus = recalculateStatus(allResponses ?? [])

    const { error: statusErr } = await sb
      .from('shows')
      .update({ status: newStatus })
      .eq('id', showId)

    if (statusErr) return json(500, { ok: false, error: statusErr.message })

    // ── Build summary counts for the UI ───────────────────────
    const counts = { available: 0, unavailable: 0, maybe: 0, pending: 0 }
    for (const r of (allResponses ?? [])) {
      const key = r.response as keyof typeof counts
      if (key in counts) counts[key]++
    }

    return json(200, {
      ok: true,
      personId,
      response,
      showStatus: newStatus,
      counts,
    })

  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}
