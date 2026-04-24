import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data: share, error: shareError } = await supabaseAdmin
    .from('calendar_shares')
    .select('id, auth_user_id, revoked')
    .eq('id', token)
    .maybeSingle()

  if (shareError || !share) {
    return NextResponse.json({ error: 'Calendar not found.' }, { status: 404 })
  }

  if (share.revoked) {
    return NextResponse.json({ error: 'This calendar link has been revoked.' }, { status: 410 })
  }

  const authUserId = share.auth_user_id

  // Get user's display name from auth.users metadata
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(authUserId)
  const fullName = userData?.user?.user_metadata?.full_name ?? userData?.user?.email ?? 'Unknown'

  // Find all people records matching this user's email across all projects
  const userEmail = userData?.user?.email?.trim().toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ name: fullName, shows: [] })
  }

  const { data: peopleRecords } = await supabaseAdmin
    .from('people')
    .select('id, project_id')
    .ilike('email', userEmail)

  if (!peopleRecords || peopleRecords.length === 0) {
    return NextResponse.json({ name: fullName, shows: [] })
  }

  const personIds = peopleRecords.map((p: any) => p.id)

  // Get all show assignments for those people records
  const { data: assignments } = await supabaseAdmin
    .from('show_assignments')
    .select('show_id, person_id, roles(name)')
    .in('person_id', personIds)

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ name: fullName, shows: [] })
  }

  const assignmentMap = new Map(
    assignments.map((a: any) => [a.show_id, {
      role_name: a.roles?.name ?? null,
      person_id: a.person_id,
    }])
  )

  const showIds = assignments.map((a: any) => a.show_id)

  // Fetch show details including venue and project name
  const { data: shows } = await supabaseAdmin
    .from('shows')
    .select('id, title, starts_at, ends_at, project_id, venue_id, venues(name, city, state), projects(name)')
    .in('id', showIds)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  if (!shows) {
    return NextResponse.json({ name: fullName, shows: [] })
  }

  const result = shows.map((s: any) => {
    const assignment = assignmentMap.get(s.id)
    const personId = assignment?.person_id

    return {
      id: s.id,
      title: s.title,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      project_name: s.projects?.name ?? 'Unknown Band',
      venue_name: s.venues?.name ?? null,
      venue_city: s.venues?.city ?? null,
      venue_state: s.venues?.state ?? null,
      role_name: assignment?.role_name ?? null,
    }
  })

  return NextResponse.json({ name: fullName, shows: result })
}
