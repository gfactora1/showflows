import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'ShowFlows <notifications@showflows.net>'

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status })
}

function extractProjectId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'projects') {
    return parts[2] ?? null
  }
  return null
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function formatShowTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

type ConflictItem = {
  blockDateStr: string
  blockTimeStr: string
  note: string | null
}

type Body = {
  personId: string
  showId: string
  triggeredByUserId: string
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const projectId = extractProjectId(url.pathname)
  if (!projectId) return json(400, { error: 'Missing projectId' })

  const supabase = await supabaseSSR()

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Authentication required' })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const { personId, showId, triggeredByUserId } = body

  // 1. Load the show
  const { data: showData } = await supabase
    .from('shows')
    .select('id, title, starts_at, ends_at, venues(name)')
    .eq('id', showId)
    .maybeSingle()

  if (!showData) return json(404, { error: 'Show not found' })

  const showStartDate = showData.starts_at.split('T')[0]
  const showEndDate = showData.ends_at.split('T')[0]

  // 2. Load the person
  const { data: personData } = await supabase
    .from('people')
    .select('id, display_name, email')
    .eq('id', personId)
    .maybeSingle()

  if (!personData) return json(404, { error: 'Person not found' })

  // 3. Check for unavailability blocks that overlap the show
  const { data: blockData } = await supabase
    .from('member_unavailability')
    .select('start_date, end_date, start_time, end_time, note')
    .eq('people_id', personId)
    .lte('start_date', showEndDate)
    .gte('end_date', showStartDate)

  if (!blockData || blockData.length === 0) {
    return json(200, { sent: 0, reason: 'No unavailability blocks overlap this show' })
  }

  // 4. Load project info
  const { data: projectData } = await supabase
    .from('projects')
    .select('id, name, owner')
    .eq('id', projectId)
    .maybeSingle()

  if (!projectData) return json(404, { error: 'Project not found' })

  // 5. Get owner and triggered-by emails
  const { data: ownerMember } = await supabase
    .from('project_members')
    .select('member_email, member_user_id')
    .eq('project_id', projectId)
    .eq('role', 'owner')
    .maybeSingle()

  const { data: triggerMember } = await supabase
    .from('project_members')
    .select('member_email, member_user_id')
    .eq('project_id', projectId)
    .eq('member_user_id', triggeredByUserId)
    .maybeSingle()

  // Build show description
  const venueName = (showData as any).venues?.name ? ` \u00b7 ${(showData as any).venues.name}` : ''
  const showStr = `${showData.title}${venueName}`
  const showTimeStr = `${formatShowTime(showData.starts_at)} \u2192 ${formatShowTime(showData.ends_at)}`

  // Build conflict list
  const conflicts: ConflictItem[] = blockData.map((b: any) => ({
    blockDateStr: b.start_date === b.end_date
      ? formatDate(b.start_date)
      : `${formatDate(b.start_date)} \u2014 ${formatDate(b.end_date)}`,
    blockTimeStr: b.start_time && b.end_time
      ? `${formatTime(b.start_time)} \u2014 ${formatTime(b.end_time)}`
      : 'Full day',
    note: b.note,
  }))

  const blockListHtml = conflicts.map((c) => `
    <li style="margin-bottom:8px">
      <strong>${c.blockDateStr}</strong> \u2014 ${c.blockTimeStr}
      ${c.note ? `<br><span style="color:#888;font-size:13px">${c.note}</span>` : ''}
    </li>
  `).join('')

  // 6. Send owner/editor email
  const adminSubject = `Scheduling conflict \u2014 ${projectData.name}`
  const adminHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">
        <img src="https://showflows.net/logo.png" alt="ShowFlows" width="120" style="height:auto;display:block" />
      </div>
      <h2 style="font-size:20px;margin-bottom:4px">&#9888; Scheduling Conflict</h2>
      <p style="color:#666;margin-top:0">${projectData.name}</p>
      <p><strong>${personData.display_name}</strong> has been added to
        <strong>${showStr}</strong>
        (${showTimeStr}), but has unavailability blocks during this period:</p>
      <ul style="padding-left:20px">${blockListHtml}</ul>
      <p style="color:#888;font-size:13px">You may need to arrange a fill-in or confirm this assignment with the member.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#aaa;font-size:12px">ShowFlows &mdash; Conflict Notification</p>
    </div>
  `

  const emailsSent: string[] = []

  const adminEmails = new Set<string>()
  if (ownerMember?.member_email) adminEmails.add(ownerMember.member_email)
  if (triggerMember?.member_email && triggerMember.member_user_id !== ownerMember?.member_user_id) {
    adminEmails.add(triggerMember.member_email)
  }

  for (const email of adminEmails) {
    try {
      await resend.emails.send({
        from: FROM,
        to: [email],
        subject: adminSubject,
        html: adminHtml,
      })
      emailsSent.push(email)
    } catch (e) {
      console.error('Failed to send admin email:', e)
    }
  }

  // 7. Send member email if they have one
  if (personData.email && personData.email !== ownerMember?.member_email) {
    const memberSubject = `Scheduling conflict \u2014 ${projectData.name}`
    const memberHtml = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">
          <img src="https://showflows.net/logo.png" alt="ShowFlows" width="120" style="height:auto;display:block" />
        </div>
        <h2 style="font-size:20px;margin-bottom:4px">&#9888; Scheduling Conflict</h2>
        <p style="color:#666;margin-top:0">${projectData.name}</p>
        <p>Hi ${personData.display_name},</p>
        <p>You have been added to <strong>${showStr}</strong> (${showTimeStr}),
          but you have unavailability blocks during this period:</p>
        <ul style="padding-left:20px">${blockListHtml}</ul>
        <p style="color:#888;font-size:13px">Please contact your project manager if you have any questions.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:12px">ShowFlows &mdash; Conflict Notification</p>
      </div>
    `

    try {
      await resend.emails.send({
        from: FROM,
        to: [personData.email],
        subject: memberSubject,
        html: memberHtml,
      })
      emailsSent.push(personData.email)
    } catch (e) {
      console.error('Failed to send member email:', e)
    }
  }

  return json(200, { sent: emailsSent.length, emails: emailsSent })
}
