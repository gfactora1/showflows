'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

// Props no longer need projectId/projectName — we load all projects ourselves
type Props = {
  // Optional single-project override (e.g. if called from a context that wants
  // to pre-filter). When omitted, loads all projects the user belongs to.
  initialProjectId?: string
}

type UserProject = {
  id: string
  name: string
  color: string
}

type Show = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  role_name: string | null
  is_confirmed: boolean
  project_id: string
  project_name: string
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function formatMonthYear(y: number, m: number) {
  return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function formatShowDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function formatShowTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return narrow
}

export default function MemberShowsView({ initialProjectId }: Props) {
  const now = new Date()
  const [viewYear, setViewYear]       = useState(now.getFullYear())
  const [viewMonth, setViewMonth]     = useState(now.getMonth())
  const [shows, setShows]             = useState<Show[]>([])
  const [userProjects, setUserProjects] = useState<UserProject[]>([])
  const [filterProjectId, setFilterProjectId] = useState<string | null>(initialProjectId ?? null)
  const [loading, setLoading]         = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [filterOpen, setFilterOpen]   = useState(false)
  const [timeFilter, setTimeFilter]   = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [timeFilterOpen, setTimeFilterOpen] = useState(false)
  const filterRef     = useRef<HTMLDivElement>(null)
  const timeFilterRef = useRef<HTMLDivElement>(null)

  const today  = todayStr()
  const narrow = useIsNarrow()

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
      if (!timeFilterRef.current?.contains(e.target as Node)) setTimeFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Load projects this user belongs to
  const loadUserProjects = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const { data } = await supabase
      .from('project_members')
      .select('project_id, projects(id, name, color)')
      .eq('member_email', user.email.trim().toLowerCase())

    if (!data) return
    const projs: UserProject[] = (data as any[])
      .map((row) => row.projects)
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, name: p.name, color: p.color }))

    setUserProjects(projs)
  }, [])

  useEffect(() => { loadUserProjects() }, [loadUserProjects])

  // Load shows for the selected month, across all (or filtered) projects
  const loadShows = useCallback(async (year: number, month: number, projectFilter: string | null) => {
    setLoading(true)
    setErrorMsg('')
    setSelectedDate(null)

    const firstDay = toDateStr(year, month, 1)
    const lastDay  = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not logged in.')
      const userEmail = user.email.trim().toLowerCase()

      // Determine which project IDs to query
      let projectIds: string[]
      if (projectFilter) {
        projectIds = [projectFilter]
      } else {
        if (userProjects.length === 0) {
          // Projects not loaded yet — try loading them first
          const { data: memberRows } = await supabase
            .from('project_members')
            .select('project_id')
            .eq('member_email', userEmail)
          projectIds = (memberRows ?? []).map((r: any) => r.project_id)
        } else {
          projectIds = userProjects.map((p) => p.id)
        }
      }

      if (projectIds.length === 0) { setShows([]); setLoading(false); return }

      const allShows: Show[] = []

      // For each project, find this user's people record and assignments
      for (const pid of projectIds) {
        const projectName = userProjects.find((p) => p.id === pid)?.name ?? ''

        const { data: personData } = await supabase
          .from('people').select('id')
          .eq('project_id', pid).ilike('email', userEmail).maybeSingle()

        if (!personData) {
          // No roster match — show all project shows for this month
          const { data: projectShows } = await supabase
            .from('shows').select('id, title, starts_at, ends_at, venues(name, address, city, state)')
            .eq('project_id', pid)
            .gte('starts_at', firstDay + 'T00:00:00Z')
            .lte('starts_at', lastDay + 'T23:59:59Z')
            .order('starts_at', { ascending: true })

          ;(projectShows ?? []).forEach((s: any) => {
            allShows.push({
              id: s.id, title: s.title, starts_at: s.starts_at, ends_at: s.ends_at,
              venue_name: s.venues?.name ?? null,
              venue_address: s.venues?.address ?? null,
              venue_city: s.venues?.city ?? null,
              venue_state: s.venues?.state ?? null,
              role_name: null, is_confirmed: false,
              project_id: pid, project_name: projectName,
            })
          })
          continue
        }

        const { data: assignments } = await supabase
          .from('show_assignments').select('show_id, is_confirmed, roles(name)')
          .eq('person_id', personData.id).eq('project_id', pid)

        if (!assignments || assignments.length === 0) continue

        const assignMap = new Map(
          assignments.map((a: any) => [a.show_id, {
            is_confirmed: a.is_confirmed,
            role_name: a.roles?.name ?? null,
          }])
        )
        const showIds = assignments.map((a: any) => a.show_id)

        const { data: showData } = await supabase
          .from('shows').select('id, title, starts_at, ends_at, venues(name, address, city, state)')
          .in('id', showIds)
          .gte('starts_at', firstDay + 'T00:00:00Z')
          .lte('starts_at', lastDay + 'T23:59:59Z')
          .order('starts_at', { ascending: true })

        ;(showData ?? []).forEach((s: any) => {
          const a = assignMap.get(s.id)
          allShows.push({
            id: s.id, title: s.title, starts_at: s.starts_at, ends_at: s.ends_at,
            venue_name: s.venues?.name ?? null,
            venue_address: s.venues?.address ?? null,
            venue_city: s.venues?.city ?? null,
            venue_state: s.venues?.state ?? null,
            role_name: a?.role_name ?? null,
            is_confirmed: a?.is_confirmed ?? false,
            project_id: pid, project_name: projectName,
          })
        })
      }

      // Sort all shows chronologically
      allShows.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      setShows(allShows)
    } catch (e: any) {
      setErrorMsg(`Error loading shows: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [userProjects])

  useEffect(() => {
    loadShows(viewYear, viewMonth, filterProjectId)
  }, [viewYear, viewMonth, filterProjectId, loadShows])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const showDates = new Set(shows.map((s) => s.starts_at.split('T')[0]))
  const showsByDate = new Map<string, Show[]>()
  shows.forEach((s) => {
    const d = s.starts_at.split('T')[0]
    if (!showsByDate.has(d)) showsByDate.set(d, [])
    showsByDate.get(d)!.push(s)
  })

  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const dayLabels      = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const timeFilteredShows = shows.filter((s) => {
    const isPast = s.starts_at.split('T')[0] < today
    if (timeFilter === 'upcoming') return !isPast
    if (timeFilter === 'past')     return isPast
    return true
  })

  const displayedShows = selectedDate
    ? timeFilteredShows.filter((s) => s.starts_at.split('T')[0] === selectedDate)
    : timeFilteredShows

  const filterProject = userProjects.find((p) => p.id === filterProjectId) ?? null

  // ── Calendar constants ──────────────────────────────────────────────────────
  const calContainer    = '#131424'
  const calCell         = '#3E4268'
  const calPastCell     = '#2E3152'
  const calCellHover    = '#4A4F7A'
  const calBorderFuture = 'rgba(255,255,255,0.18)'
  const calBorderPast   = 'rgba(255,255,255,0.10)'

  // ── Calendar block ──────────────────────────────────────────────────────────
  const calendarBlock = (
    <div style={{ flexShrink: 0, width: '100%', maxWidth: 568 }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: colors.textSecondary, fontFamily: font.sans }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colors.elevated)}
          onMouseLeave={(e) => (e.currentTarget.style.background = colors.card)}
        >‹</button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign: 'center', color: colors.textPrimary }}>
          {formatMonthYear(viewYear, viewMonth)}
        </div>
        <button
          onClick={nextMonth}
          style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: colors.textSecondary, fontFamily: font.sans }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colors.elevated)}
          onMouseLeave={(e) => (e.currentTarget.style.background = colors.card)}
        >›</button>
        {loading && <span style={{ fontSize: 13, color: colors.textMuted }}>Loading…</span>}
      </div>

      {/* Calendar grid */}
      <div style={{ background: calContainer, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: radius.xl, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
          {dayLabels.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: colors.textSecondary, paddingBottom: 6, letterSpacing: '0.04em' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day        = i + 1
            const dateStr    = toDateStr(viewYear, viewMonth, day)
            const hasShow    = showDates.has(dateStr)
            const isToday    = dateStr === today
            const isSelected = selectedDate === dateStr
            const isPast     = dateStr < today
            const isHovered  = hoveredDate === dateStr && !isSelected

            const dayShows      = showsByDate.get(dateStr) ?? []
            const allConfirmed  = dayShows.length > 0 && dayShows.every((s) => s.is_confirmed)
            const someConfirmed = dayShows.some((s) => s.is_confirmed)

            let bg        = isPast ? calPastCell : calCell
            let border    = isPast ? calBorderPast : calBorderFuture
            let bw        = '1px'
            let numColor  = isPast ? colors.textDim : '#9CA8C8'
            let dotColor: string | null = null
            let dotOpacity = 1
            let boxShadow = 'none'

            if (isSelected) {
              bg = colors.violet; border = colors.violet; bw = '2px'; numColor = '#fff'
            } else if (isToday) {
              bg = 'rgba(41,95,255,0.15)'; border = colors.blue; bw = '2px'
              numColor = colors.textPrimary; boxShadow = '0 0 0 2px rgba(41,95,255,0.25)'
            } else if (isHovered) {
              bg = calCellHover; numColor = colors.textPrimary
            }
            if (isToday && hasShow && !isSelected) {
              bg = isPast ? 'rgba(124,58,237,0.20)' : 'rgba(124,58,237,0.32)'
              border = colors.blue; bw = '2px'; boxShadow = '0 0 0 2px rgba(41,95,255,0.25)'
              numColor = colors.textPrimary
            } else if (hasShow && !isSelected && !isToday) {
              bg = isPast ? 'rgba(124,58,237,0.20)' : 'rgba(124,58,237,0.32)'
              numColor = colors.textPrimary
            }
            if (hasShow && !isSelected) {
              dotColor = allConfirmed ? colors.green : someConfirmed ? colors.amber : colors.violetLight
              dotOpacity = isPast ? 0.5 : 1
            }

            return (
              <div
                key={dateStr}
                onClick={() => hasShow && setSelectedDate(isSelected ? null : dateStr)}
                onMouseEnter={() => setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                style={{
                  aspectRatio: '1', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: radius.md, border: `${bw} solid ${border}`,
                  background: bg, boxShadow,
                  cursor: hasShow ? 'pointer' : 'default',
                  transition: `background ${transition.fast}, border-color ${transition.fast}`,
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: isToday || hasShow ? 600 : 400, color: numColor, lineHeight: 1 }}>
                  {day}
                </span>
                {dotColor && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, marginTop: 2, flexShrink: 0, opacity: dotOpacity }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { dot: colors.green,       label: 'Confirmed' },
          { dot: colors.amber,       label: 'Partially confirmed' },
          { dot: colors.violetLight, label: 'Unconfirmed show' },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: colors.textMuted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Show list panel ─────────────────────────────────────────────────────────
  const timeFilterLabels = { upcoming: 'Upcoming', past: 'Past', all: 'All' }

  const countLabel = (() => {
    if (loading) return ''
    const n = displayedShows.length
    const s = n === 1 ? '' : 's'
    return `${n} show${s}`
  })()

  const showListBlock = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Panel header */}
      <div style={{ marginBottom: 14 }}>
        {selectedDate ? (
          /* Date-selected state — show date + clear */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <button
              onClick={() => setSelectedDate(null)}
              style={{ background: 'none', border: 'none', fontSize: 12, color: colors.textMuted, cursor: 'pointer', padding: 0 }}
            >
              Show all
            </button>
          </div>
        ) : (
          /* Default state — [filter ▾]  count on same row */
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Time filter — ghost, list-level control */}
            <div ref={timeFilterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setTimeFilterOpen((o) => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md, padding: '3px 8px',
                  fontSize: 12, color: colors.textMuted,
                  cursor: 'pointer', fontFamily: font.sans, whiteSpace: 'nowrap',
                  transition: `border-color ${transition.fast}, color ${transition.fast}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.borderStrong
                  e.currentTarget.style.color = colors.textSecondary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border
                  e.currentTarget.style.color = colors.textMuted
                }}
              >
                <span>{timeFilterLabels[timeFilter]}</span>
                <span style={{ fontSize: 9 }}>▾</span>
              </button>

              {timeFilterOpen && (
                <div style={{
                  position: 'absolute', top: 32, left: 0, zIndex: 200,
                  background: colors.card, border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radius.lg, padding: 4, minWidth: 130,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                }}>
                  {(['upcoming', 'past', 'all'] as const).map((opt) => (
                    <div
                      key={opt}
                      onClick={() => { setTimeFilter(opt); setTimeFilterOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 11px', borderRadius: radius.sm, cursor: 'pointer',
                        fontSize: 13, color: timeFilter === opt ? colors.violet : colors.textSecondary,
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = colors.elevated)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
                    >
                      <span>{timeFilterLabels[opt]}</span>
                      {timeFilter === opt && <span style={{ fontSize: 11, color: colors.violet }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Count — same row with separator */}
            {!loading && (
              <>
                <span style={{ fontSize: 11, color: colors.textDim }}>·</span>
                <span style={{ fontSize: 12, color: colors.textMuted }}>{countLabel}</span>
              </>
            )}
          </div>
        )}
      </div>

      {!loading && displayedShows.length === 0 && (
        <p style={{ fontSize: 14, color: colors.textMuted, fontStyle: 'italic', margin: 0 }}>
          {selectedDate
            ? 'No shows on this date.'
            : timeFilter === 'upcoming'
            ? 'No upcoming shows this month.'
            : timeFilter === 'past'
            ? 'No past shows this month.'
            : 'No shows this month.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayedShows.map((show) => {
          const isPast = show.starts_at.split('T')[0] < today
          const proj = userProjects.find((p) => p.id === show.project_id)
          return (
            <div
              key={show.id}
              style={{
                border: `1px solid ${show.is_confirmed ? 'rgba(34,197,94,0.2)' : colors.border}`,
                borderRadius: radius.lg,
                padding: '10px 14px',
                background: colors.card,
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                opacity: isPast ? 0.6 : 1,
              }}
            >
              {/* Title + status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary, lineHeight: 1.3 }}>
                  {show.title}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                  padding: '2px 8px', borderRadius: radius.full,
                  background: show.is_confirmed ? colors.greenSoft : colors.surface,
                  color: show.is_confirmed ? colors.green : colors.textMuted,
                  border: `1px solid ${show.is_confirmed ? 'rgba(34,197,94,0.3)' : colors.border}`,
                }}>
                  {show.is_confirmed ? '✓ Confirmed' : 'Unconfirmed'}
                </span>
              </div>

              {/* Project name with color dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                {proj && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: proj.color ?? colors.violet, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, letterSpacing: '0.02em' }}>
                  {show.project_name}
                </span>
              </div>

              {/* Venue + directions */}
              {show.venue_name && (
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>📍 {show.venue_name}</span>
                  {(show.venue_address || show.venue_city) && (() => {
                    const parts = [show.venue_name, show.venue_address, show.venue_city, show.venue_state].filter(Boolean).join(', ')
                    return (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(parts)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: colors.blue, textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        Get directions
                      </a>
                    )
                  })()}
                </div>
              )}

              {/* Date/time */}
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                {formatShowDate(show.starts_at)} · {formatShowTime(show.starts_at)} – {formatShowTime(show.ends_at)}
              </div>

              {/* Role */}
              {show.role_name && (
                <div style={{ fontSize: 11, color: colors.violetLight, marginTop: 5, fontWeight: 500 }}>
                  {show.role_name}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Heading ─────────────────────────────────────────────────────────────────

  return (
    <section style={{ fontFamily: font.sans }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: colors.textPrimary, fontSize: 17, fontWeight: 700, lineHeight: 1 }}>
            My Schedule
          </h3>
          <span style={{ color: colors.textDim, fontSize: 15, fontWeight: 300, lineHeight: 1 }}>—</span>

          {/* Project filter — primary pill, page-level scope */}
          <div ref={filterRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: filterProject ? colors.violetSoft2 : colors.elevated,
                border: `1px solid ${filterProject ? colors.violet : colors.borderStrong}`,
                borderRadius: radius.md, padding: '5px 10px',
                fontSize: 13, fontWeight: 500,
                color: filterProject ? colors.violetLight : colors.textSecondary,
                cursor: 'pointer', fontFamily: font.sans, whiteSpace: 'nowrap',
                transition: `background ${transition.fast}, border-color ${transition.fast}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = filterProject ? colors.violetSoft : colors.card
                e.currentTarget.style.borderColor = colors.violet
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = filterProject ? colors.violetSoft2 : colors.elevated
                e.currentTarget.style.borderColor = filterProject ? colors.violet : colors.borderStrong
              }}
            >
              {filterProject ? (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: filterProject.color ?? colors.violet, flexShrink: 0 }} />
              ) : (
                <span style={{ fontSize: 11, color: filterProject ? colors.violetLight : colors.textMuted }}>⊙</span>
              )}
              <span>{filterProject ? filterProject.name : 'All Projects'}</span>
              <span style={{ fontSize: 11, color: filterProject ? colors.violetLight : colors.textSecondary, marginLeft: 1 }}>▾</span>
            </button>

            {filterOpen && (
              <div style={{
                position: 'absolute', top: 38, left: 0, zIndex: 200,
                background: colors.card, border: `1px solid ${colors.borderStrong}`,
                borderRadius: radius.lg, padding: 4, minWidth: 200,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              }}>
                <div style={{ padding: '5px 11px 6px', fontSize: 11, fontWeight: 600, color: colors.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  Schedule scope
                </div>
                <div style={{ height: 1, background: colors.border, marginBottom: 3 }} />
                <div
                  onClick={() => { setFilterProjectId(null); setFilterOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', borderRadius: radius.sm, cursor: 'pointer', fontSize: 13, color: filterProjectId === null ? colors.violet : colors.textSecondary, background: 'transparent' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = colors.elevated)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>⊙</span>
                    <span>All Projects</span>
                  </div>
                  {filterProjectId === null && <span style={{ fontSize: 11, color: colors.violet }}>✓</span>}
                </div>
                {userProjects.length > 0 && <div style={{ height: 1, background: colors.border, margin: '3px 0' }} />}
                {userProjects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => { setFilterProjectId(p.id); setFilterOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', borderRadius: radius.sm, cursor: 'pointer', fontSize: 13, color: filterProjectId === p.id ? colors.violet : colors.textSecondary, background: 'transparent' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = colors.elevated)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color ?? colors.violet, flexShrink: 0 }} />
                      <span>{p.name}</span>
                    </div>
                    {filterProjectId === p.id && <span style={{ fontSize: 11, color: colors.violet }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {errorMsg && <p style={{ color: colors.red, fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>}

      {/* Desktop: side-by-side. Mobile: stacked. */}
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {calendarBlock}
          {showListBlock}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
          {calendarBlock}
          {showListBlock}
        </div>
      )}
    </section>
  )
}
