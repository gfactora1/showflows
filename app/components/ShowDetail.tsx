'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, font, radius, transition } from './tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type ShowStatus =
  | 'draft'
  | 'availability_requested'
  | 'needs_attention'
  | 'ready_to_confirm'
  | 'confirmed'

type AvailabilityResponse = 'pending' | 'available' | 'unavailable' | 'maybe'

// Original Show type — load_in_at added (exists in DB, used for call time in message preview)
type Show = {
  id: string
  project_id: string
  title: string
  venue_id: string | null
  starts_at: string
  ends_at: string
  load_in_at: string | null
  notes: string | null
}

// Original Venue type — unchanged
type Venue = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

// Original Person type — email added for email count display
type Person = {
  id: string
  display_name: string
  email: string | null
}

// Original RoleRow type — unchanged
type RoleRow = {
  id: string
  name: string
}

// Original Assignment type — unchanged (is_confirmed preserved)
type Assignment = {
  id: string
  person_id: string
  role_id: string | null
  is_confirmed: boolean
  notes: string | null
  person?: Person
  role?: RoleRow
}

// Availability-specific types (new)
type AvailabilityRequest = {
  id: string
  sent_at: string
  include_location: boolean
  include_call_time: boolean
  include_notes: boolean
  include_pay: boolean
  include_lineup: boolean
}

type MessageFlags = {
  include_location: boolean
  include_call_time: boolean
  include_notes: boolean
  include_pay: boolean
  include_lineup: boolean
}

// Original Props type — projectName optional, does not break existing call sites
type Props = {
  show: Show
  projectId: string
  myRole: Role | null
  onBack: () => void
  projectName?: string  // optional — used in availability message preview
}

// ── Original helpers — unchanged ──────────────────────────────────────────────

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function mapsUrl(venue: Venue) {
  const parts = [venue.address, venue.city, venue.state, venue.zip]
    .filter(Boolean)
    .join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`
}

// ── Availability helpers (new) ────────────────────────────────────────────────

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

// Pure function — builds the availability request message from show data + flags.
// No component logic here.
function buildAvailabilityMessage(
  show: Show,
  venue: Venue | null,
  projectName: string,
  flags: MessageFlags,
  assignments: Assignment[],
): string {
  const date = formatShortDate(show.starts_at)
  const callTime = show.load_in_at ? formatTime(show.load_in_at) : formatTime(show.starts_at)

  let location = ''
  if (flags.include_location && venue) {
    const cityState = [venue.city, venue.state].filter(Boolean).join(', ')
    location = cityState ? ` at ${venue.name} (${cityState})` : ` at ${venue.name}`
  }

  const parts: string[] = [
    `${projectName} is checking availability for "${show.title}" on ${date}${location}.`,
  ]

  if (flags.include_call_time) {
    parts.push(`Call time: ${callTime}.`)
  }
  if (flags.include_notes && show.notes) {
    parts.push(`Notes: ${show.notes}`)
  }
  if (flags.include_lineup && assignments.length > 0) {
    const names = assignments.map((a) => a.person?.display_name).filter(Boolean).join(', ')
    parts.push(`Lineup: ${names}`)
  }
  if (flags.include_pay) {
    parts.push(`Pay: [not set]`)
  }
  parts.push('Reply YES, NO, or MAYBE.')

  return parts.join(' ')
}

function statusConfig(status: ShowStatus) {
  switch (status) {
    case 'draft':
      return { label: 'Draft', bg: colors.elevated, color: colors.textMuted }
    case 'availability_requested':
      return { label: 'Availability Requested', bg: colors.amberSoft, color: colors.amber }
    case 'needs_attention':
      return { label: 'Needs Attention', bg: colors.redSoft, color: colors.red }
    case 'ready_to_confirm':
      return { label: 'Ready to Confirm', bg: colors.greenSoft, color: colors.green }
    case 'confirmed':
      return { label: 'Confirmed ✓', bg: colors.greenSoft, color: colors.green }
  }
}

function responseConfig(response: AvailabilityResponse) {
  switch (response) {
    case 'pending':
      return { label: 'Pending', bg: colors.elevated, color: colors.textMuted }
    case 'available':
      return { label: 'Available ✓', bg: colors.greenSoft, color: colors.green }
    case 'unavailable':
      return { label: 'Unavailable', bg: colors.redSoft, color: colors.red }
    case 'maybe':
      return { label: 'Maybe', bg: colors.amberSoft, color: colors.amber }
  }
}

// ── Availability-scoped button/pill styles (new — do not affect original styles) ──

const avBtnPrimary: React.CSSProperties = {
  padding: '6px 13px',
  background: colors.violet,
  border: 'none',
  borderRadius: radius.md,
  color: 'white',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const avBtnGhost: React.CSSProperties = {
  padding: '5px 11px',
  background: 'transparent',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.md,
  color: colors.textSecondary,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const avBtnGhostGreen: React.CSSProperties = {
  ...avBtnGhost,
  border: `1px solid rgba(34,197,94,0.35)`,
  color: colors.green,
}

const avBtnGhostAmber: React.CSSProperties = {
  ...avBtnGhost,
  border: `1px solid rgba(245,158,11,0.35)`,
  color: colors.amber,
}

const avSelectStyle: React.CSSProperties = {
  padding: '3px 7px',
  background: colors.elevated,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.sm,
  color: colors.textPrimary,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: font.sans,
}

const avPillStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: radius.full,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
  whiteSpace: 'nowrap' as const,
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowDetail({ show, projectId, myRole, onBack, projectName }: Props) {

  // ── Original state — all preserved ────────────────────────────────────────
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [venue, setVenue] = useState<Venue | null>(null)
  const [addPersonId, setAddPersonId] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [msg, setMsg] = useState('')

  // ── Availability state (new) ───────────────────────────────────────────────
  const [showStatus, setShowStatus]                 = useState<ShowStatus>('draft')
  const [activeRequest, setActiveRequest]           = useState<AvailabilityRequest | null>(null)
  const [responseMap, setResponseMap]               = useState<Record<string, AvailabilityResponse>>({})
  const [sendingRequest, setSendingRequest]         = useState(false)
  const [toastMsg, setToastMsg]                     = useState<string | null>(null)
  const [showCustomizeModal, setShowCustomizeModal] = useState(false)
  const [emailCount, setEmailCount]                 = useState<number | null>(null)
  const [msgFlags, setMsgFlags]                     = useState<MessageFlags>({
    include_location:  true,
    include_call_time: true,
    include_notes:     true,
    include_pay:       false,
    include_lineup:    false,
  })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canEdit   = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'
  const hasRequest = activeRequest !== null

  // ── Toast helper (new) ────────────────────────────────────────────────────
  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastMsg(message)
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000)
  }

  // ── Original fetchAll — unchanged ──────────────────────────────────────────
  const fetchAll = async (): Promise<Assignment[]> => {
    const [assignRes, peopleRes, rolesRes] = await Promise.all([
      supabase
        .from('show_assignments')
        .select('id,person_id,role_id,is_confirmed,notes')
        .eq('show_id', show.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('people')
        .select('id,display_name,email')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('display_name', { ascending: true }),
      supabase
        .from('roles')
        .select('id,name')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])

    if (assignRes.error || peopleRes.error || rolesRes.error) {
      setMsg('Error loading show data.')
      return []
    }

    const peopleList = (peopleRes.data ?? []) as Person[]
    const rolesList  = (rolesRes.data  ?? []) as RoleRow[]
    const assignList = (assignRes.data ?? []) as Assignment[]

    const enriched = assignList.map((a) => ({
      ...a,
      person: peopleList.find((p) => p.id === a.person_id),
      role:   rolesList.find((r)  => r.id === a.role_id),
    }))

    setPeople(peopleList)
    setRoles(rolesList)
    setAssignments(enriched)

    // Count how many assigned people have a valid email address
    const assignedPeopleIds = new Set(assignList.map((a) => a.person_id))
    const assignedWithEmail = peopleList.filter(
      (p) => assignedPeopleIds.has(p.id) && p.email && p.email.trim() !== ''
    )
    setEmailCount(assignedWithEmail.length)

    return assignList
  }

  // ── Original fetchVenue — unchanged ───────────────────────────────────────
  const fetchVenue = async () => {
    if (!show.venue_id) return
    const { data } = await supabase
      .from('venues')
      .select('id,name,address,city,state,zip')
      .eq('id', show.venue_id)
      .maybeSingle()
    if (data) setVenue(data as Venue)
  }

  // ── Original doSeed — unchanged ───────────────────────────────────────────
  const doSeed = async (existingAssignments: Assignment[]) => {
    const { data: rosterData, error: rosterErr } = await supabase
      .from('project_default_roster')
      .select('person_id,role_id')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (rosterErr || !rosterData || rosterData.length === 0) return 0

    const currentIds = existingAssignments.map((a) => a.person_id)
    const toInsert = rosterData.filter(
      (entry) => !currentIds.includes(entry.person_id)
    )

    if (toInsert.length === 0) return 0

    const inserts = toInsert.map((entry) => ({
      project_id:   projectId,
      show_id:      show.id,
      person_id:    entry.person_id,
      role_id:      entry.role_id,
      is_confirmed: false,
    }))

    const { error: insertErr } = await supabase
      .from('show_assignments')
      .insert(inserts)

    if (insertErr) throw insertErr

    return toInsert.length
  }

  // ── Availability fetch (new) ──────────────────────────────────────────────
  const fetchAvailability = async () => {
    const { data: showData } = await supabase
      .from('shows')
      .select('status')
      .eq('id', show.id)
      .maybeSingle()
    if (showData?.status) setShowStatus(showData.status as ShowStatus)

    const { data: requestData } = await supabase
      .from('availability_requests')
      .select('id,sent_at,include_location,include_call_time,include_notes,include_pay,include_lineup')
      .eq('show_id', show.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!requestData) {
      setActiveRequest(null)
      setResponseMap({})
      return
    }

    setActiveRequest(requestData as AvailabilityRequest)
    setMsgFlags({
      include_location:  requestData.include_location,
      include_call_time: requestData.include_call_time,
      include_notes:     requestData.include_notes,
      include_pay:       requestData.include_pay,
      include_lineup:    requestData.include_lineup,
    })

    const { data: responsesData } = await supabase
      .from('availability_responses')
      .select('person_id,response')
      .eq('request_id', requestData.id)

    const map: Record<string, AvailabilityResponse> = {}
    for (const r of (responsesData ?? [])) {
      map[r.person_id] = r.response as AvailabilityResponse
    }
    setResponseMap(map)
  }

  // ── Original useEffect — fetchAvailability added alongside originals ───────
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchVenue(), fetchAvailability()])
      const existing = await fetchAll()

      if (existing.length === 0 && canEdit) {
        setSeeding(true)
        try {
          const added = await doSeed(existing)
          if (added > 0) await fetchAll()
        } catch (e: any) {
          setMsg(`Error auto-seeding: ${e?.message ?? String(e)}`)
        } finally {
          setSeeding(false)
        }
      }
    }

    init()
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [show.id])

  // ── Original manualSeed — unchanged ───────────────────────────────────────
  const manualSeed = async () => {
    setMsg('')
    setSeeding(true)
    try {
      const added = await doSeed(assignments)
      if (added === 0) {
        setMsg('Everyone in the default roster is already assigned to this show.')
      } else {
        await fetchAll()
        setMsg(`Added ${added} person${added !== 1 ? 's' : ''} from the default roster.`)
      }
    } catch (e: any) {
      setMsg(`Error seeding roster: ${e?.message ?? String(e)}`)
    } finally {
      setSeeding(false)
    }
  }

  // ── Original addAssignment — unchanged ────────────────────────────────────
  const addAssignment = async () => {
    setMsg('')
    if (!addPersonId) return setMsg('Select a person.')

    const already = assignments.find((a) => a.person_id === addPersonId)
    if (already) return setMsg('That person is already assigned to this show.')

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase.from('show_assignments').insert({
        project_id:   projectId,
        show_id:      show.id,
        person_id:    addPersonId,
        role_id:      addRoleId || null,
        is_confirmed: false,
      })

      if (error) throw error

      if (user) {
        fetch(`/api/projects/${projectId}/notify-assignment-conflict`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personId: addPersonId,
            showId: show.id,
            triggeredByUserId: user.id,
          }),
        }).catch((e) => console.error('Notification error:', e))
      }

      setAddPersonId('')
      setAddRoleId('')
      await fetchAll()
    } catch (e: any) {
      setMsg(`Error adding assignment: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Original updateAssignmentRole — unchanged ─────────────────────────────
  const updateAssignmentRole = async (assignmentId: string, roleId: string) => {
    const { error } = await supabase
      .from('show_assignments')
      .update({ role_id: roleId || null })
      .eq('id', assignmentId)

    if (error) {
      setMsg(`Error updating role: ${error.message}`)
      return
    }

    await fetchAll()
  }

  // ── Original toggleConfirmed — unchanged ──────────────────────────────────
  const toggleConfirmed = async (assignment: Assignment) => {
    const { error } = await supabase
      .from('show_assignments')
      .update({ is_confirmed: !assignment.is_confirmed })
      .eq('id', assignment.id)

    if (error) {
      setMsg(`Error updating: ${error.message}`)
      return
    }

    await fetchAll()
  }

  // ── Original removeAssignment — unchanged ─────────────────────────────────
  const removeAssignment = async (assignmentId: string) => {
    if (!confirm('Remove this person from the show?')) return
    setMsg('')

    const { error } = await supabase
      .from('show_assignments')
      .delete()
      .eq('id', assignmentId)

    if (error) {
      setMsg(`Error removing: ${error.message}`)
      return
    }

    await fetchAll()
  }

  // ── Availability actions (new) ────────────────────────────────────────────

  const sendRequest = async (flags: MessageFlags, isResend: boolean) => {
    setSendingRequest(true)
    setMsg('')
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shows/${show.id}/request-availability`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...flags, resend: isResend }),
        }
      )
      const data = await res.json()

      // Debug: log full API response so we can verify the shape
      console.log('[ShowDetail] request-availability response:', JSON.stringify(data, null, 2))

      if (!data.ok) throw new Error(data.error ?? 'Request failed.')

      // ── existing: true branch ──────────────────────────────────
      // API found an existing request and resend was not requested.
      // The response includes the existing request object in data.request.
      // Set state directly from it — do NOT rely on fetchAvailability.
      if (data.existing && !isResend) {
        const req = data.request
        console.log('[ShowDetail] existing request, setting activeRequest from:', req)
        if (req?.id) {
          setActiveRequest({
            id:                req.id,
            sent_at:           req.sent_at,
            include_location:  req.include_location  ?? true,
            include_call_time: req.include_call_time ?? true,
            include_notes:     req.include_notes     ?? true,
            include_pay:       req.include_pay       ?? false,
            include_lineup:    req.include_lineup    ?? false,
          })
          // Fetch responses for the existing request — these already exist in DB
          // so a client-side query should find them
          const { data: responsesData } = await supabase
            .from('availability_responses')
            .select('person_id,response')
            .eq('request_id', req.id)
          const map: Record<string, AvailabilityResponse> = {}
          for (const r of (responsesData ?? [])) {
            map[r.person_id] = r.response as AvailabilityResponse
          }
          setResponseMap(map)
          // Also sync show status
          const { data: showData } = await supabase
            .from('shows').select('status').eq('id', show.id).maybeSingle()
          if (showData?.status) setShowStatus(showData.status as ShowStatus)
        }
        showToast('A request already exists for this show.')
        return
      }

      // ── new send / resend branch ───────────────────────────────
      // Set state directly from API response — no client refetch.
      // RLS timing means a freshly-inserted row may not be visible
      // to the client session immediately, so we construct state
      // from the returned data instead.

      const newRequest: AvailabilityRequest = {
        id:                data.requestId,
        sent_at:           data.sentAt,
        include_location:  data.include_location  ?? flags.include_location,
        include_call_time: data.include_call_time ?? flags.include_call_time,
        include_notes:     data.include_notes     ?? flags.include_notes,
        include_pay:       data.include_pay       ?? flags.include_pay,
        include_lineup:    data.include_lineup    ?? flags.include_lineup,
      }

      console.log('[ShowDetail] setting activeRequest:', newRequest)
      setActiveRequest(newRequest)
      setShowStatus((data.showStatus ?? 'availability_requested') as ShowStatus)

      // Seed all assigned people as pending in responseMap
      const pendingMap: Record<string, AvailabilityResponse> = {}
      for (const pid of (data.personIds ?? [])) {
        pendingMap[pid] = 'pending'
      }
      // Fallback: if personIds not in response, use current assignments
      if ((data.personIds ?? []).length === 0) {
        for (const a of assignments) {
          pendingMap[a.person_id] = 'pending'
        }
      }
      setResponseMap(pendingMap)

      const count = data.recipientCount ?? assignments.length
      showToast(`Availability request sent to ${count} member${count !== 1 ? 's' : ''}.`)

    } catch (e: any) {
      console.error('[ShowDetail] sendRequest error:', e)
      setMsg(`Error: ${e?.message ?? String(e)}`)
    } finally {
      setSendingRequest(false)
    }
  }

  const handleQuickSend = () => sendRequest(msgFlags, hasRequest)

  const handleCustomizeSend = () => {
    setShowCustomizeModal(false)
    sendRequest(msgFlags, hasRequest)
  }

  const setPersonResponse = async (personId: string, response: AvailabilityResponse) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shows/${show.id}/set-response`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId, response }),
        }
      )
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Update failed.')
      setResponseMap((prev) => ({ ...prev, [personId]: response }))
      setShowStatus(data.showStatus as ShowStatus)
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`)
    }
  }

  const confirmShow = async (force: boolean = false) => {
    if (force) {
      const ok = window.confirm(
        'Some members have not confirmed or said they are unavailable. Confirm this show anyway?'
      )
      if (!ok) return
    }
    try {
      const { error } = await supabase
        .from('shows')
        .update({ status: 'confirmed' })
        .eq('id', show.id)
      if (error) throw error
      setShowStatus('confirmed')
      showToast('Show confirmed.')
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`)
    }
  }

  // ── Original derived values — unchanged ───────────────────────────────────
  const unassignedPeople = people.filter(
    (p) => !assignments.find((a) => a.person_id === p.id)
  )

  const venueDisplay = venue
    ? [venue.city, venue.state].filter(Boolean).join(', ')
    : null

  // ── Availability derived values (new) ─────────────────────────────────────
  const responseCounts = assignments.reduce(
    (acc, a) => {
      const r = responseMap[a.person_id] ?? 'pending'
      acc[r] = (acc[r] ?? 0) + 1
      return acc
    },
    {} as Record<AvailabilityResponse, number>
  )

  const pendingCount     = responseCounts.pending     ?? 0
  const availableCount   = responseCounts.available   ?? 0
  const unavailableCount = responseCounts.unavailable ?? 0
  const maybeCount       = responseCounts.maybe       ?? 0
  const statusCfg        = statusConfig(showStatus)
  const resolvedProjectName = projectName ?? 'Your project'
  const previewMessage   = buildAvailabilityMessage(
    show, venue, resolvedProjectName, msgFlags, assignments
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Original: Back button — unchanged ─────────────────────────────── */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          fontSize: 14,
          color: '#555',
          marginBottom: 16,
        }}
      >
        ← Back to Shows
      </button>

      {/* ── Original: Show title — unchanged ──────────────────────────────── */}
      <h3 style={{ marginTop: 0 }}>{show.title}</h3>

      {/* ── Original: Venue display — unchanged ───────────────────────────── */}
      {venue && (
        <div style={{ fontSize: 14, marginBottom: 4 }}>
          <span style={{ fontWeight: 500 }}>{venue.name}</span>
          {venueDisplay && (
            <span style={{ opacity: 0.7 }}> — {venueDisplay}</span>
          )}
          {(venue.address || venue.city) && (
            <a
              href={mapsUrl(venue)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 10, fontSize: 13, color: '#0070f3' }}
            >
              Get directions
            </a>
          )}
        </div>
      )}

      {/* ── Original: Date/time display — unchanged ───────────────────────── */}
      <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
        {formatDisplay(show.starts_at)} → {formatDisplay(show.ends_at)}
      </div>

      {/* ── Original: HR divider — unchanged ──────────────────────────────── */}
      <hr style={{ margin: '16px 0', border: 'none', borderTop: `1px solid ${colors.border}` }} />

      {/* ── NEW: Availability status badge + action buttons ───────────────── */}
      {canEdit && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10, marginBottom: 14,
        }}>
          <span style={avPillStyle(statusCfg.bg, statusCfg.color)}>
            {statusCfg.label}
          </span>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Primary action */}
            <button
              onClick={handleQuickSend}
              disabled={sendingRequest || assignments.length === 0}
              style={{
                ...avBtnPrimary,
                opacity: (sendingRequest || assignments.length === 0) ? 0.5 : 1,
                cursor: (sendingRequest || assignments.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {sendingRequest
                ? 'Sending…'
                : hasRequest ? 'Re-send Request' : 'Request Availability'}
            </button>

            {/* Secondary group — separated by a faint divider */}
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center',
              marginLeft: 6,
              paddingLeft: 12,
              borderLeft: `1px solid ${colors.borderStrong}`,
            }}>
              <button
                onClick={() => setShowCustomizeModal(true)}
                disabled={sendingRequest}
                style={{ ...avBtnGhost, fontSize: 12, opacity: sendingRequest ? 0.5 : 1 }}
              >
                Customize message ▾
              </button>

              {hasRequest && pendingCount > 0 && (
                <button style={{ ...avBtnGhost, fontSize: 12 }}>Remind Pending</button>
              )}

              {showStatus === 'ready_to_confirm' && (
                <button onClick={() => confirmShow(false)} style={{ ...avBtnGhostGreen, fontSize: 12 }}>
                  Confirm Show
                </button>
              )}
              {showStatus === 'needs_attention' && (
                <button onClick={() => confirmShow(true)} style={{ ...avBtnGhostAmber, fontSize: 12 }}>
                  Force Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── NEW: Toast ────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          padding: '7px 13px',
          background: colors.greenSoft,
          border: `1px solid rgba(34,197,94,0.25)`,
          borderRadius: radius.md,
          fontSize: 13,
          color: colors.green,
          marginBottom: 12,
          fontFamily: font.sans,
        }}>
          {toastMsg}
        </div>
      )}

      {/* ── NEW: Response summary bar — only when request exists ──────────── */}
      {hasRequest && assignments.length > 0 && (
        <div style={{
          display: 'flex', gap: 0, marginBottom: 14,
          paddingBottom: 12,
          borderBottom: `1px solid ${colors.border}`,
          fontFamily: font.sans,
        }}>
          {[
            { label: 'Available',   count: availableCount,   color: colors.green },
            { label: 'Maybe',       count: maybeCount,       color: colors.amber },
            { label: 'Unavailable', count: unavailableCount, color: colors.red },
            { label: 'Pending',     count: pendingCount,     color: colors.textMuted },
          ].map(({ label, count, color }, i, arr) => (
            <span key={label} style={{
              display: 'flex', alignItems: 'center', fontSize: 13,
              paddingRight: i < arr.length - 1 ? 16 : 0,
              marginRight: i < arr.length - 1 ? 16 : 0,
              borderRight: i < arr.length - 1 ? `1px solid ${colors.border}` : 'none',
            }}>
              <span style={{ color, fontWeight: 600 }}>{label}</span>
              <span style={{ color: colors.textSecondary, marginLeft: 6 }}>{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Original: Lineup header row — unchanged ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h4 style={{ margin: 0 }}>
          Lineup
          {seeding && (
            <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6, marginLeft: 10 }}>
              Loading roster…
            </span>
          )}
        </h4>

        {canEdit && !seeding && (
          <button
            onClick={manualSeed}
            style={{ ...avBtnGhost, fontSize: 12, padding: '4px 10px', color: colors.textMuted }}
          >
            Seed from default roster
          </button>
        )}
      </div>

      {/* ── Original: Add person controls — unchanged ─────────────────────── */}
      {canEdit && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={addPersonId}
              onChange={(e) => setAddPersonId(e.target.value)}
              style={{ padding: 8 }}
            >
              <option value="">— Add person —</option>
              {unassignedPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>

            <select
              value={addRoleId}
              onChange={(e) => setAddRoleId(e.target.value)}
              style={{ padding: 8 }}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <button
              onClick={addAssignment}
              disabled={loading || !addPersonId}
              style={{
                ...avBtnPrimary,
                opacity: (loading || !addPersonId) ? 0.3 : 1,
                cursor: (loading || !addPersonId) ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {loading ? 'Adding…' : '+ Add to show ↓'}
            </button>
          </div>
        </div>
      )}

      {/* ── Original: Error/info message — unchanged ──────────────────────── */}
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}

      {/* ── Original: Lineup table — Confirmed column preserved exactly ───── */}
      {assignments.length === 0 && !seeding ? (
        <p style={{ opacity: 0.75 }}>
          No one assigned yet.
          {canEdit && ' Use "Seed from default roster" above, or add people manually.'}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}`, padding: 8 }}>
                Person
              </th>
              <th style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}`, padding: 8 }}>
                Role
              </th>
              <th style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}`, padding: 8 }}>
                Confirmed
              </th>
              {/* NEW: Response column — only when active request exists */}
              {hasRequest && (
                <th style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}`, padding: 8 }}>
                  Response
                </th>
              )}
              {canEdit && (
                <th style={{ borderBottom: `1px solid ${colors.border}`, padding: 8 }} />
              )}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const response = responseMap[a.person_id] ?? 'pending'
              const rCfg = responseConfig(response)
              return (
                <tr key={a.id}>

                  {/* ── Original: Person — unchanged ──────────────────────── */}
                  <td style={{ padding: 8, borderBottom: `1px solid ${colors.border}` }}>
                    {a.person?.display_name ?? '—'}
                  </td>

                  {/* ── Original: Role — unchanged ────────────────────────── */}
                  <td style={{ padding: 8, borderBottom: `1px solid ${colors.border}` }}>
                    {canEdit ? (
                      <select
                        value={a.role_id ?? ''}
                        onChange={(e) => updateAssignmentRole(a.id, e.target.value)}
                        style={{ padding: 6 }}
                      >
                        <option value="">No role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      a.role?.name ?? '—'
                    )}
                  </td>

                  {/* ── Original: Confirmed checkbox — unchanged ───────────── */}
                  <td style={{ padding: 8, borderBottom: `1px solid ${colors.border}` }}>
                    <input
                      type="checkbox"
                      checked={a.is_confirmed}
                      onChange={() => toggleConfirmed(a)}
                      disabled={!canEdit}
                    />
                  </td>

                  {/* ── NEW: Response pill + override dropdown ─────────────── */}
                  {hasRequest && (
                    <td style={{ padding: 8, borderBottom: `1px solid ${colors.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={avPillStyle(rCfg.bg, rCfg.color)}>
                          {rCfg.label}
                        </span>
                        {canEdit && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                setPersonResponse(a.person_id, e.target.value as AvailabilityResponse)
                            }}
                            style={avSelectStyle}
                          >
                            <option value="" disabled>Change ▾</option>
                            <option value="pending">Pending</option>
                            <option value="available">Available</option>
                            <option value="unavailable">Unavailable</option>
                            <option value="maybe">Maybe</option>
                          </select>
                        )}
                      </div>
                    </td>
                  )}

                  {/* ── Original: Remove button — unchanged ───────────────── */}
                  {canEdit && (
                    <td style={{ padding: 8, borderBottom: `1px solid ${colors.border}`, textAlign: 'right' }}>
                      {canDelete && (
                        <button onClick={() => removeAssignment(a.id)}>Remove</button>
                      )}
                    </td>
                  )}

                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ── NEW: Customize message modal ──────────────────────────────────── */}
      {showCustomizeModal && (
        <div
          onClick={() => setShowCustomizeModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.surface,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: radius.xl,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              fontFamily: font.sans,
            }}
          >
            <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
              {hasRequest ? 'Re-send Availability Request' : 'Request Availability'}
            </h4>

            {/* Message preview */}
            <div style={{
              background: colors.elevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: '12px 14px',
              fontSize: 13,
              color: colors.textSecondary,
              lineHeight: 1.6,
              marginBottom: 16,
            }}>
              {previewMessage}
            </div>

            {/* Field toggles */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: colors.textMuted, marginBottom: 10,
              }}>
                Include in message
              </div>
              {([
                { key: 'include_location',  label: 'Location' },
                { key: 'include_call_time', label: 'Call time' },
                { key: 'include_notes',     label: 'Notes' },
                { key: 'include_pay',       label: 'Pay' },
                { key: 'include_lineup',    label: 'Lineup' },
              ] as { key: keyof MessageFlags; label: string }[]).map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 8, cursor: 'pointer',
                    fontSize: 13, color: colors.textSecondary,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={msgFlags[key]}
                    onChange={(e) =>
                      setMsgFlags((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    style={{ accentColor: colors.violet, width: 15, height: 15 }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Recipient count */}
            {emailCount !== null && emailCount < assignments.length ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: colors.textMuted }}>
                  Sending to {emailCount} of {assignments.length} member{assignments.length !== 1 ? 's' : ''} with email addresses.
                  {hasRequest ? ' Resets all responses to pending.' : ''}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: colors.amber }}>
                  {assignments.length - emailCount} member{assignments.length - emailCount !== 1 ? 's' : ''} do not have email addresses and will need manual follow-up.
                </p>
              </div>
            ) : (
              <p style={{ margin: '0 0 20px', fontSize: 12, color: colors.textMuted }}>
                Sending to {assignments.length} member{assignments.length !== 1 ? 's' : ''}
                {hasRequest ? ' · Resets all responses to pending' : ''}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCustomizeModal(false)} style={avBtnGhost}>
                Cancel
              </button>
              <button
                onClick={handleCustomizeSend}
                disabled={sendingRequest || assignments.length === 0}
                style={{
                  ...avBtnPrimary,
                  opacity: (sendingRequest || assignments.length === 0) ? 0.5 : 1,
                  cursor: (sendingRequest || assignments.length === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {sendingRequest ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
