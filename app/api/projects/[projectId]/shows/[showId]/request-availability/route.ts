// app/api/projects/[projectId]/shows/[showId]/request-availability/route.ts
//
// POST /api/projects/[projectId]/shows/[showId]/request-availability
//
// Creates an availability request for a show and seeds one pending response
// row per person currently assigned to the show's lineup.
//
// Duplicate protection:
//   - If an active request already exists, returns it with { existing: true }
//     and does NOT create a new one.
//   - Pass { resend: true } in the body to force a new request, which resets
//     all responses back to pending.
//
// No email is sent at this stage — that is Phase 5.

import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { supabaseServer } from '@/lib/supabaseServer'

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

function extractIds(pathname: string): { projectId: string | null; showId: string | null } {
  // /api/projects/[projectId]/shows/[showId]/request-availability
  const parts = pathname.split('/').filter(Boolean)
  const projectIdx = parts.indexOf('projects')
  const showIdx = parts.indexOf('shows')
  return {
    projectId: projectIdx !== -1 ? (parts[projectIdx + 1] ?? null) : null,
    showId:    showIdx    !== -1 ? (parts[showIdx    + 1] ?? null) : null,
  }
}

// ── Status recalculation ──────────────────────────────────────────────────────
// Shared logic — also used by set-response and the token respond route.
// Rules:
//   all available                       → ready_to_confirm
//   any unavailable or maybe            → needs_attention
//   mix of pending + available only     → availability_requested
//   no responses at all (empty lineup)  → availability_requested

export function recalculateStatus(
  responses: { response: string }[]
): string {
  if (responses.length === 0) return 'availability_requested'

  const counts = { available: 0, unavailable: 0, maybe: 0, pending: 0 }
  for (const r of responses) {
    const key = r.response as keyof typeof counts
    if (key in counts) counts[key]++
  }

  if (counts.unavailable > 0 || counts.maybe > 0) return 'needs_attention'
  if (counts.pending > 0) return 'availability_requested'
  // All available, none pending/unavailable/maybe
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

    // ── Parse body ─────────────────────────────────────────────
    let body: {
      resend?: boolean
      include_location?: boolean
      include_call_time?: boolean
      include_notes?: boolean
      include_pay?: boolean
      include_lineup?: boolean
      message_override?: string
    } = {}
    try { body = await req.json() } catch { /* empty body is fine */ }

    const resend = body.resend === true

    // ── Verify show exists and belongs to project ──────────────
    const { data: show, error: showErr } = await supabase
      .from('shows')
      .select('id, project_id, title, status')
      .eq('id', showId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (showErr) return json(500, { ok: false, error: showErr.message })
    if (!show)   return json(404, { ok: false, error: 'Show not found.' })

    const sb = supabaseServer()

    // ── Duplicate protection ───────────────────────────────────
    // "Active" = the most recent request for this show.
    // We don't have an explicit "closed" flag — the most recent row is active.
    const { data: existingRequest, error: existingErr } = await sb
      .from('availability_requests')
      .select('id, sent_at, include_location, include_call_time, include_notes, include_pay, include_lineup')
      .eq('show_id', showId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingErr) return json(500, { ok: false, error: existingErr.message })

    if (existingRequest && !resend) {
      // Return the existing request — caller can decide what to show
      return json(200, {
        ok: true,
        existing: true,
        request: existingRequest,
        message: 'An availability request already exists for this show. Pass resend: true to create a new one and reset all responses.',
      })
    }

    // ── Load current lineup ────────────────────────────────────
    const { data: assignments, error: assignErr } = await sb
      .from('show_assignments')
      .select('person_id')
      .eq('show_id', showId)
      .eq('project_id', projectId)

    if (assignErr) return json(500, { ok: false, error: assignErr.message })

    const personIds = (assignments ?? []).map((a: { person_id: string }) => a.person_id)

    if (personIds.length === 0) {
      return json(422, {
        ok: false,
        error: 'No one is assigned to this show. Add people to the lineup before sending an availability request.',
      })
    }

    // ── Create availability_requests row ───────────────────────
    const { data: newRequest, error: requestErr } = await sb
      .from('availability_requests')
      .insert({
        show_id:          showId,
        project_id:       projectId,
        sent_by:          user.id,
        include_location: body.include_location  ?? true,
        include_call_time: body.include_call_time ?? true,
        include_notes:    body.include_notes     ?? true,
        include_pay:      body.include_pay       ?? false,
        include_lineup:   body.include_lineup    ?? false,
        message_override: body.message_override  ?? null,
      })
      .select('id, sent_at')
      .single()

    if (requestErr) return json(500, { ok: false, error: requestErr.message })

    // ── Seed one pending response per person ───────────────────
    const responseRows = personIds.map((personId: string) => ({
      request_id: newRequest.id,
      show_id:    showId,
      project_id: projectId,
      person_id:  personId,
      response:   'pending',
    }))

    const { error: responsesErr } = await sb
      .from('availability_responses')
      .insert(responseRows)

    if (responsesErr) return json(500, { ok: false, error: responsesErr.message })

    // ── Update show status ─────────────────────────────────────
    // All responses are pending at this point, so status is always
    // availability_requested after initial send.
    const { error: statusErr } = await sb
      .from('shows')
      .update({ status: 'availability_requested' })
      .eq('id', showId)

    if (statusErr) return json(500, { ok: false, error: statusErr.message })

    return json(200, {
      ok: true,
      existing: false,
      requestId:        newRequest.id,
      sentAt:           newRequest.sent_at,
      recipientCount:   personIds.length,
      personIds,
      showStatus:       'availability_requested',
      include_location:  body.include_location  ?? true,
      include_call_time: body.include_call_time ?? true,
      include_notes:     body.include_notes     ?? true,
      include_pay:       body.include_pay       ?? false,
      include_lineup:    body.include_lineup    ?? false,
    })

  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}
