import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toIcalDate(iso: string) {
  return iso.replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeIcal(str: string) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data: share } = await supabaseAdmin
    .from('calendar_shares')
    .select('id, auth_user_id, revoked')
    .eq('id', token)
    .maybeSingle()

  if (!share || share.revoked) {
    return new NextResponse('Calendar not found or revoked.', { status: 404 })
  }

  const authUserId = share.auth_user_id

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(authUserId)
  const fullName = userData?.user?.user_metadata?.full_name ?? 'ShowFlows User'
  const userEmail = userData?.user?.email?.trim().toLowerCase()

  if (!userEmail) return buildEmptyCalendar(fullName)

  const { data: peopleRecords } = await supabaseAdmin
    .from('people')
    .select('id, project_id')
    .ilike('email', userEmail)

  if (!peopleRecords || peopleRecords.length === 0) return buildEmptyCalendar(fullName)

  const personIds = peopleRecords.map((p: any) => p.id)

  const { data: assignments } = await supabaseAdmin
    .from('show_assignments')
    .select('show_id, person_id, roles(name)')
    .in('person_id', personIds)

  if (!assignments || assignments.length === 0) return buildEmptyCalendar(fullName)

  const assignmentMap = new Map(
    assignments.map((a: any) => [a.show_id, { role_name: a.roles?.name ?? null }])
  )

  const showIds = assignments.map((a: any) => a.show_id)

  const { data: shows } = await supabaseAdmin
    .from('shows')
    .select('id, title, starts_at, ends_at, project_id, venues(name, city, state), projects(name)')
    .in('id', showIds)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  if (!shows || shows.length === 0) return buildEmptyCalendar(fullName)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://showflows.net'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShowFlows//ShowFlows Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(fullName)}'s Shows`,
    'X-WR-TIMEZONE:UTC',
    'X-WR-CALDESC:ShowFlows schedule — shared via ShowFlows',
  ]

  for (const show of shows) {
    const assignment = assignmentMap.get(show.id)
    const venueParts = [show.venues?.name, show.venues?.city, show.venues?.state].filter(Boolean)
    const venueStr = venueParts.join(', ')
    const projectName = show.projects?.name ?? 'Unknown Band'
    const roleName = assignment?.role_name
    const summary = `${show.title} — ${projectName}`
    const description = [
      roleName ? `Role: ${roleName}` : null,
      venueStr ? `Venue: ${venueStr}` : null,
      `Band: ${projectName}`,
    ].filter(Boolean).join('\\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${show.id}@showflows.net`)
    lines.push(`DTSTAMP:${toIcalDate(new Date().toISOString())}`)
    lines.push(`DTSTART:${toIcalDate(show.starts_at)}`)
    lines.push(`DTEND:${toIcalDate(show.ends_at)}`)
    lines.push(`SUMMARY:${escapeIcal(summary)}`)
    if (description) lines.push(`DESCRIPTION:${escapeIcal(description)}`)
    if (venueStr) lines.push(`LOCATION:${escapeIcal(venueStr)}`)
    lines.push(`URL:${appUrl}/cal/${token}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  const safeFileName = fullName.replace(/\s+/g, '-').toLowerCase()

  return new NextResponse(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="showflows-${safeFileName}.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

function buildEmptyCalendar(name: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShowFlows//ShowFlows Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${name}'s Shows`,
    'X-WR-CALDESC:ShowFlows schedule — no upcoming shows',
    'END:VCALENDAR',
  ]
  return new NextResponse(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
