'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ShowDetail from './ShowDetail'

type Props = {
  projectId: string
}

type Show = {
  id: string
  project_id: string
  title: string
  venue_id: string | null
  starts_at: string
  ends_at: string
  notes: string | null
  venue_name: string | null
}

type AssignmentInfo = {
  assignment_id: string | null
  is_confirmed: boolean
  role_name: string | null
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })
}

function formatShowDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatShowTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

export default function MemberShowsView({ projectId }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [shows, setShows] = useState<Show[]>([])
  const [assignmentMap, setAssignmentMap] = useState<Record<string, AssignmentInfo>>({})
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [noPersonFound, setNoPersonFound] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [selectedShow, setSelectedShow] = useState<Show | null>(null)

  const today = todayStr()

  const loadShows = useCallback(async (year: number, month: number) => {
    setLoading(true)
    setErrorMsg('')
    setSelectedDate(null)
    setSelectedShow(null)

    const firstDay = toDateStr(year, month, 1)
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not logged in.')

      const userEmail = user.email.trim().toLowerCase()

      const { data: personData } = await supabase
        .from('people')
        .select('id')
        .eq('project_id', projectId)
        .ilike('email', userEmail)
        .maybeSingle()

      if (!personData) {
        setNoPersonFound(true)
        const { data: allShows, error: allShowsError } = await supabase
          .from('shows')
          .select('id, title, starts_at, ends_at, venue_id, notes, venues(name)')
          .eq('project_id', projectId)
          .gte('starts_at', firstDay + 'T00:00:00Z')
          .lte('starts_at', lastDay + 'T23:59:59Z')
          .order('starts_at', { ascending: true })

        if (allShowsError) throw allShowsError

        setShows((allShows ?? []).map((s: any) => ({
          id: s.id,
          project_id: projectId,
          title: s.title,
          venue_id: s.venue_id ?? null,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          notes: s.notes ?? null,
          venue_name: s.venues?.name ?? null,
        })))
        setAssignmentMap({})
        setLoading(false)
        return
      }

      setNoPersonFound(false)

      const { data: assignmentData, error: assignError } = await supabase
        .from('show_assignments')
        .select('id, show_id, is_confirmed, roles(name)')
        .eq('person_id', personData.id)
        .eq('project_id', projectId)

      if (assignError) throw assignError

      if (!assignmentData || assignmentData.length === 0) {
        setShows([])
        setAssignmentMap({})
        setLoading(false)
        return
      }

      const newAssignmentMap: Record<string, AssignmentInfo> = {}
      assignmentData.forEach((a: any) => {
        newAssignmentMap[a.show_id] = {
          assignment_id: a.id,
          is_confirmed: a.is_confirmed,
          role_name: a.roles?.name ?? null,
        }
      })

      const showIds = assignmentData.map((a: any) => a.show_id)

      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('id, title, starts_at, ends_at, venue_id, notes, venues(name)')
        .in('id', showIds)
        .gte('starts_at', firstDay + 'T00:00:00Z')
        .lte('starts_at', lastDay + 'T23:59:59Z')
        .order('starts_at', { ascending: true })

      if (showError) throw showError

      setShows((showData ?? []).map((s: any) => ({
        id: s.id,
        project_id: projectId,
        title: s.title,
        venue_id: s.venue_id ?? null,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        notes: s.notes ?? null,
        venue_name: s.venues?.name ?? null,
      })))
      setAssignmentMap(newAssignmentMap)
    } catch (e: any) {
      setErrorMsg(`Error loading shows: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadShows(viewYear, viewMonth)
  }, [viewYear, viewMonth, loadShows])

  const confirmShow = async (showId: string, assignmentId: string) => {
    setConfirming(assignmentId)

    const { error } = await supabase
      .from('show_assignments')
      .update({ is_confirmed: true })
      .eq('id', assignmentId)

    if (error) {
      setErrorMsg(`Error confirming: ${error.message}`)
    } else {
      setAssignmentMap((prev) => ({
        ...prev,
        [showId]: { ...prev[showId], is_confirmed: true },
      }))
    }
    setConfirming(null)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // If a show is selected, render ShowDetail in read-only member mode
  if (selectedShow) {
    return (
      <ShowDetail
        show={selectedShow}
        projectId={projectId}
        myRole="member"
        onBack={() => setSelectedShow(null)}
      />
    )
  }

  const showDates = new Set(shows.map((s) => s.starts_at.split('T')[0]))
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const displayedShows = selectedDate
    ? shows.filter((s) => s.starts_at.split('T')[0] === selectedDate)
    : shows

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>My Shows</h3>

      {noPersonFound && (
        <div style={{ background: '#fffbf0', border: '1px solid #ffe0a0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7a5500', marginBottom: 16 }}>
          ⚠️ Your email wasn't matched to a roster entry in this project — showing all project shows. Ask your project owner to add your email to your roster entry.
        </div>
      )}

      {errorMsg && <p style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>}

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333' }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>{formatMonthYear(viewYear, viewMonth)}</div>
        <button onClick={nextMonth} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333' }}>›</button>
        {loading && <span style={{ fontSize: 13, color: '#999' }}>Loading…</span>}
      </div>

      {/* Mini calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, maxWidth: 420, marginBottom: 24 }}>
        {dayLabels.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#888', paddingBottom: 4 }}>{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = toDateStr(viewYear, viewMonth, day)
          const hasShow = showDates.has(dateStr)
          const isToday = dateStr === today
          const isSelected = selectedDate === dateStr
          const isPast = dateStr < today

          return (
            <div
              key={dateStr}
              onClick={() => { if (hasShow) setSelectedDate(isSelected ? null : dateStr) }}
              style={{
                aspectRatio: '1',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6,
                border: isSelected ? '2px solid #111' : hasShow ? '1.5px solid #6c47ff' : '1.5px solid #eee',
                background: isSelected ? '#111' : hasShow ? '#f0ecff' : isPast ? '#fafafa' : 'white',
                cursor: hasShow ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isSelected ? 'white' : isPast ? '#ccc' : '#333' }}>{day}</span>
              {hasShow && !isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6c47ff', marginTop: 1 }} />}
            </div>
          )
        })}
      </div>

      {/* Selected date label */}
      {selectedDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#888', cursor: 'pointer', padding: 0 }}>Show all</button>
        </div>
      )}

      {/* Show list */}
      {!loading && displayedShows.length === 0 && (
        <p style={{ fontSize: 14, color: '#888', fontStyle: 'italic' }}>
          {selectedDate ? 'No shows on this date.' : 'No shows assigned to you this month.'}
        </p>
      )}

      {displayedShows.map((show) => {
        const assignment = assignmentMap[show.id]
        const assignmentId = assignment?.assignment_id ?? null
        const isConfirmed = assignment?.is_confirmed ?? false
        const roleName = assignment?.role_name ?? null

        return (
          <div
            key={show.id}
            style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', marginBottom: 10, background: 'white' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{show.title}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                background: isConfirmed ? '#edfff3' : '#f5f5f5',
                color: isConfirmed ? '#1a7a3a' : '#888',
                border: `1px solid ${isConfirmed ? '#b2f0c8' : '#e5e5e5'}`,
                flexShrink: 0, marginLeft: 8,
              }}>
                {isConfirmed ? '✓ Confirmed' : 'Unconfirmed'}
              </div>
            </div>

            {show.venue_name && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>📍 {show.venue_name}</div>}
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
              {formatShowDate(show.starts_at)} · {formatShowTime(show.starts_at)} – {formatShowTime(show.ends_at)}
            </div>
            {roleName && <div style={{ fontSize: 12, color: '#6c47ff', marginTop: 6, fontWeight: 500 }}>{roleName}</div>}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {/* View setlist button */}
              <button
                onClick={() => setSelectedShow(show)}
                style={{ padding: '7px 14px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#333' }}
              >
                View Details & Setlist
              </button>

              {/* Confirm button */}
              {!isConfirmed && assignmentId && (
                <button
                  onClick={() => confirmShow(show.id, assignmentId)}
                  disabled={confirming === assignmentId}
                  style={{ padding: '7px 16px', background: confirming === assignmentId ? '#999' : '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: confirming === assignmentId ? 'not-allowed' : 'pointer' }}
                >
                  {confirming === assignmentId ? 'Confirming…' : 'Confirm attendance'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
