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

type Body = {
  peopleId: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  note: string | null
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

  const { peopleId, startDate, endDate, startTime, endTime, note, triggeredByUserId } = body

  // 1. Load the affected person
  const { data: personData } = await supabase
    .from('people')
    .select('id, display_name, email')
    .eq('id', peopleId)
    .maybeSingle()

  if (!personData) return json(404, { error: 'Person not found' })

  // 2. Find shows in this project that overlap the block date range
  const { data: showData } = await supabase
    .from('shows')
    .select('id, title, starts_at, ends_at, venues(name)')
    .eq('project_id', projectId)
    .lte('starts_at', endDate + 'T23:59:59Z')
    .gte('ends_at', startDate + 'T00:00:00Z')

  if (!showData || showData.length === 0) {
    return json(200, { sent: 0, reason: 'No shows overlap this block' })
  }

  // 3. Check if the person is assigned to any of those shows
  const showIds = showData.map((s: any) => s.id)

  const { data: assignmentData } = await supabase
    .from('show_assignments')
    .select('show_id')
    .eq('person_id', peopleId)
    .in('show_id', showIds)

  if (!assignmentData || assignmentData.length === 0) {
    return json(200, { sent: 0, reason: 'Person not assigned to any conflicting shows' })
  }

  const conflictingShowIds = new Set(assignmentData.map((a: any) => a.show_id))
  const conflictingShows = showData.filter((s: any) => conflictingShowIds.has(s.id))

  // 4. Load project info and owner email
  const { data: projectData } = await supabase
    .from('projects')
    .select('id, name, owner')
    .eq('id', projectId)
    .maybeSingle()

  if (!projectData) return json(404, { error: 'Project not found' })

  // 5. Get owner email
  const { data: ownerMember } = await supabase
    .from('project_members')
    .select('member_email, member_user_id')
    .eq('project_id', projectId)
    .eq('role', 'owner')
    .maybeSingle()

  // 6. Get triggered-by user email (editor or owner)
  const { data: triggerMember } = await supabase
    .from('project_members')
    .select('member_email, member_user_id')
    .eq('project_id', projectId)
    .eq('member_user_id', triggeredByUserId)
    .maybeSingle()

  // Build block description
  const blockDateStr = startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} — ${formatDate(endDate)}`
  const blockTimeStr = startTime && endTime
    ? `${formatTime(startTime)} – ${formatTime(endTime)}`
    : 'Full day'

  // Build show list HTML
  const showListHtml = conflictingShows.map((s: any) => {
    const venueName = s.venues?.name ? ` · ${s.venues.name}` : ''
    return `<li style="margin-bottom:8px"><strong>${s.title}${venueName}</strong><br>
      <span style="color:#666;font-size:13px">${formatShowTime(s.starts_at)} → ${formatShowTime(s.ends_at)}</span>
    </li>`
  }).join('')

  const noteStr = note ? `<p style="color:#666;font-size:13px">Note: ${note}</p>` : ''

  // 7. Send owner/editor email (digest)
  const adminSubject = `⚠️ Scheduling conflict — ${projectData.name}`
  const adminHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="font-size:20px;margin-bottom:4px">⚠️ Scheduling Conflict</h2>
      <p style="color:#666;margin-top:0">${projectData.name}</p>
      <p><strong>${personData.display_name}</strong> has been marked unavailable on 
        <strong>${blockDateStr}</strong> (${blockTimeStr}), but is assigned to 
        ${conflictingShows.length === 1 ? 'a show' : 'shows'} during this period:</p>
      <ul style="padding-left:20px">${showListHtml}</ul>
      ${noteStr}
      <p style="color:#888;font-size:13px">You may need to arrange a fill-in or adjust the lineup.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#aaa;font-size:12px">ShowFlows — Conflict Notification</p>
    </div>
  `

  const emailsSent: string[] = []

  // Collect unique admin emails
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

  // 8. Send member email if they have an email address
  if (personData.email && personData.email !== ownerMember?.member_email) {
    const memberSubject = `⚠️ You have a scheduling conflict — ${projectData.name}`
    const memberHtml = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="font-size:20px;margin-bottom:4px">⚠️ Scheduling Conflict</h2>
        <p style="color:#666;margin-top:0">${projectData.name}</p>
        <p>Hi ${personData.display_name},</p>
        <p>You have been marked unavailable on <strong>${blockDateStr}</strong> (${blockTimeStr}), 
          but you are assigned to ${conflictingShows.length === 1 ? 'a show' : 'shows'} during this period:</p>
        <ul style="padding-left:20px">${showListHtml}</ul>
        ${noteStr}
        <p style="color:#888;font-size:13px">Please contact your project manager if you have any questions.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:12px">ShowFlows — Conflict Notification</p>
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
