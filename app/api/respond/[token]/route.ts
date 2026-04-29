// app/api/respond/[token]/route.ts
//
// POST /api/respond/[token]
//
// No-auth member response via tokenized email link.
// The response_token UUID in availability_responses is the credential.
//
// Body: { response: 'available' | 'unavailable' | 'maybe' }
//
// Note: 'pending' is not accepted here — members cannot un-respond via link.
// Admins use set-response to reset to pending.
//
// After updating, recalculates and updates shows.status.
// Returns enough data for the /respond/[token] page to render a confirmation.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role — no auth context on this route, token is the credential
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

const VALID_RESPONSES = ['available', 'unavailable', 'maybe'] as const
type ResponseValue = typeof VALID_RESPONSES[number]

// ── Status recalculation ──────────────────────────────────────────────────────

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

// ── GET — fetch current state for the response page ──────────────────────────
// The /respond/[token] page calls this on load to render show details
// and the member's current response.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) return json(400, { ok: false, error: 'Missing token.' })

    // Look up the response row by token
    const { data: responseRow, error: lookupErr } = await supabaseAdmin
      .from('availability_responses')
      .select('id, response, responded_at, show_id, project_id, person_id, request_id')
      .eq('response_token', token)
      .maybeSingle()

    if (lookupErr) return json(500, { ok: false, error: lookupErr.message })
    if (!responseRow) return json(404, { ok: false, error: 'This link is invalid or has expired.' })

    // Load show details (check it isn't deleted)
    const { data: show, error: showErr } = await supabaseAdmin
      .from('shows')
      .select('id, title, starts_at, ends_at, load_in_at, status, venues(name, city, state)')
      .eq('id', responseRow.show_id)
      .maybeSingle()

    if (showErr) return json(500, { ok: false, error: showErr.message })
    if (!show) return json(404, { ok: false, error: 'This show no longer exists.' })

    if (show.deleted_at) {
      return json(410, { ok: false, error: 'This show has been cancelled.' })
    }

    // Load project name
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', responseRow.project_id)
      .maybeSingle()

    // Load person name
    const { data: person } = await supabaseAdmin
      .from('people')
      .select('display_name')
      .eq('id', responseRow.person_id)
      .maybeSingle()

    // Load response progress counts for this request
    const { data: allResponses } = await supabaseAdmin
      .from('availability_responses')
      .select('response')
      .eq('request_id', responseRow.request_id)

    const total = (allResponses ?? []).length
    const responded = (allResponses ?? []).filter((r: { response: string }) => r.response !== 'pending').length

    return json(200, {
      ok: true,
      currentResponse: responseRow.response,
      respondedAt: responseRow.responded_at,
      personName: person?.display_name ?? null,
      show: {
        id: show.id,
        title: show.title,
        starts_at: show.starts_at,
        ends_at: show.ends_at,
        load_in_at: show.load_in_at,
        status: show.status,
        venue_name: (show.venues as any)?.name ?? null,
        venue_city: (show.venues as any)?.city ?? null,
        venue_state: (show.venues as any)?.state ?? null,
      },
      project: {
        name: project?.name ?? null,
      },
      progress: { responded, total },
    })

  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}

// ── POST — record the member's response ───────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) return json(400, { ok: false, error: 'Missing token.' })

    // ── Parse body ─────────────────────────────────────────────
    let body: { response?: string } = {}
    try { body = await req.json() } catch {
      return json(400, { ok: false, error: 'Invalid JSON body.' })
    }

    const { response } = body

    if (!response || !VALID_RESPONSES.includes(response as ResponseValue)) {
      return json(400, {
        ok: false,
        error: `response must be one of: ${VALID_RESPONSES.join(', ')}.`,
      })
    }

    // ── Look up response row by token ──────────────────────────
    const { data: responseRow, error: lookupErr } = await supabaseAdmin
      .from('availability_responses')
      .select('id, show_id, project_id, request_id, response')
      .eq('response_token', token)
      .maybeSingle()

    if (lookupErr) return json(500, { ok: false, error: lookupErr.message })
    if (!responseRow) return json(404, { ok: false, error: 'This link is invalid or has expired.' })

    // ── Verify show is still active ────────────────────────────
    const { data: show, error: showErr } = await supabaseAdmin
      .from('shows')
      .select('id, deleted_at')
      .eq('id', responseRow.show_id)
      .maybeSingle()

    if (showErr) return json(500, { ok: false, error: showErr.message })
    if (!show) return json(404, { ok: false, error: 'This show no longer exists.' })
    if (show.deleted_at) {
      return json(410, { ok: false, error: 'This show has been cancelled.' })
    }

    // ── Update the response ────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('availability_responses')
      .update({
        response,
        responded_at: new Date().toISOString(),
      })
      .eq('id', responseRow.id)

    if (updateErr) return json(500, { ok: false, error: updateErr.message })

    // ── Recalculate show status ────────────────────────────────
    const { data: allResponses, error: responsesErr } = await supabaseAdmin
      .from('availability_responses')
      .select('response')
      .eq('request_id', responseRow.request_id)

    if (responsesErr) return json(500, { ok: false, error: responsesErr.message })

    const newStatus = recalculateStatus(allResponses ?? [])

    const { error: statusErr } = await supabaseAdmin
      .from('shows')
      .update({ status: newStatus })
      .eq('id', responseRow.show_id)

    if (statusErr) return json(500, { ok: false, error: statusErr.message })

    // ── Progress counts for confirmation page ──────────────────
    const total = (allResponses ?? []).length
    const responded = (allResponses ?? []).filter((r: { response: string }) => r.response !== 'pending').length

    return json(200, {
      ok: true,
      response,
      showStatus: newStatus,
      progress: { responded, total },
    })

  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'Unknown error' })
  }
}
