'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Props = {
  projectId: string
}

type Show = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  venue_name: string | null
  role_name: string | null
  is_confirmed: boolean
  assignment_id: string | null
}

type Block = {
  id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

type DayInfo = {
  shows: Show[]
  blocks: Block[]
  hasConflict: boolean
}

const blankForm = {
  start_date: '',
  end_date: '',
  full_day: true,
  start_time: '',
  end_time: '',
  note: '',
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

function formatShowTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

function formatDateRange(block: Block) {
  const start = new Date(block.start_date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const end = new Date(block.end_date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const dateStr = start === end ? start : `${start} \u2014 ${end}`

  if (block.start_time && block.end_time) {
    const fmt = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      const ampm = h >= 12 ? 'pm' : 'am'
      const hour = h % 12 || 12
      return `${hour}:${String(m).padStart(2, '0')}${ampm}`
    }
    return `${dateStr}, ${fmt(block.start_time)} \u2013 ${fmt(block.end_time)}`
  }

  return `${dateStr} (full day)`
}

function blocksOverlapShow(block: Block, show: Show): boolean {
  const showDate = show.starts_at.split('T')[0]
  if (block.start_date > showDate || block.end_date < showDate) return false
  // Full day block always conflicts
  if (!block.start_time || !block.end_time) return true
  // Time-based overlap check
  const showStart = show.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00'
  const showEnd = show.ends_at.split('T')[1]?.substring(0, 5) ?? '23:59'
  return block.start_time < showEnd && block.end_time > showStart
}

export default function MemberAvailability({ projectId }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [personId, setPersonId] = useState<string | null>(null)
  const [personFound, setPersonFound] = useState<boolean | null>(null)
  const [shows, setShows] = useState<Show[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const today = todayStr()

  // Resolve person ID from logged-in user email
  useEffect(() => {
    const resolvePerson = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return

      const { data } = await supabase
        .from('people')
        .select('id')
        .eq('project_id', projectId)
        .ilike('email', user.email.trim().toLowerCase())
        .maybeSingle()

      if (data?.id) {
        setPersonId(data.id)
        setPersonFound(true)
      } else {
        setPersonFound(false)
      }
    }
    resolvePerson()
  }, [projectId])

  const loadData = useCallback(async (year: number, month: number, pid: string) => {
    setLoading(true)
    setErrorMsg('')

    const firstDay = toDateStr(year, month, 1)
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

    try {
      // Load assigned shows for this month
      const { data: assignmentData, error: assignError } = await supabase
        .from('show_assignments')
        .select('id, show_id, is_confirmed, roles(name)')
        .eq('person_id', pid)
        .eq('project_id', projectId)

      if (assignError) throw assignError

      let fetchedShows: Show[] = []

      if (assignmentData && assignmentData.length > 0) {
        const assignmentMap = new Map(
          assignmentData.map((a: any) => [a.show_id, {
            assignment_id: a.id,
            is_confirmed: a.is_confirmed,
            role_name: a.roles?.name ?? null,
          }])
        )

        const showIds = assignmentData.map((a: any) => a.show_id)

        const { data: showData, error: showError } = await supabase
          .from('shows')
          .select('id, title, starts_at, ends_at, venues(name)')
          .in('id', showIds)
          .gte('starts_at', firstDay + 'T00:00:00Z')
          .lte('starts_at', lastDay + 'T23:59:59Z')
          .order('starts_at', { ascending: true })

        if (showError) throw showError

        fetchedShows = (showData ?? []).map((s: any) => {
          const a = assignmentMap.get(s.id)
          return {
            id: s.id,
            title: s.title,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            venue_name: s.venues?.name ?? null,
            role_name: a?.role_name ?? null,
            is_confirmed: a?.is_confirmed ?? false,
            assignment_id: a?.assignment_id ?? null,
          }
        })
      }

      setShows(fetchedShows)

      // Load all unavailability blocks for this person (all time — so they can manage past ones too)
      const { data: blockData, error: blockError } = await supabase
        .from('member_unavailability')
        .select('id, start_date, end_date, start_time, end_time, note')
        .eq('people_id', pid)
        .order('start_date', { ascending: true })

      if (blockError) throw blockError

      setBlocks((blockData ?? []) as Block[])
    } catch (e: any) {
      setErrorMsg(`Error loading data: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (personId) {
      loadData(viewYear, viewMonth, personId)
    }
  }, [viewYear, viewMonth, personId, loadData])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const validate = () => {
    if (!form.start_date) return 'Start date is required.'
    if (!form.end_date) return 'End date is required.'
    if (form.end_date < form.start_date) return 'End date must be on or after start date.'
    if (!form.full_day) {
      if (!form.start_time) return 'Start time is required.'
      if (!form.end_time) return 'End time is required.'
      if (form.end_time <= form.start_time) return 'End time must be after start time.'
    }
    return null
  }

  const saveBlock = async () => {
    setFormMsg('')
    const err = validate()
    if (err) { setFormMsg(err); return }
    if (!personId) return

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in.')

      const { error } = await supabase.from('member_unavailability').insert({
        people_id: personId,
        auth_user_id: user.id,
        created_by_user_id: user.id,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.full_day ? null : form.start_time || null,
        end_time: form.full_day ? null : form.end_time || null,
        note: form.note.trim() || null,
      })

      if (error) throw error

      // Fire conflict notification in background
      fetch(`/api/projects/${projectId}/notify-availability-conflict`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peopleId: personId,
          startDate: form.start_date,
          endDate: form.end_date,
          startTime: form.full_day ? null : form.start_time || null,
          endTime: form.full_day ? null : form.end_time || null,
          note: form.note.trim() || null,
          triggeredByUserId: user.id,
        }),
      }).catch((e) => console.error('Notification error:', e))

      setForm(blankForm)
      setShowAddForm(false)
      await loadData(viewYear, viewMonth, personId)
    } catch (e: any) {
      setFormMsg(`Error saving: ${e?.message ?? String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const deleteBlock = async (id: string) => {
    if (!confirm('Remove this unavailability block?')) return
    if (!personId) return

    const { error } = await supabase
      .from('member_unavailability')
      .delete()
      .eq('id', id)

    if (error) {
      setErrorMsg(`Error removing block: ${error.message}`)
      return
    }

    await loadData(viewYear, viewMonth, personId)
  }

  // Build day map for calendar
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const dayMap: Record<string, DayInfo> = {}
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(viewYear, viewMonth, d)

    const dayShows = shows.filter((s) => {
      const showDate = s.starts_at.split('T')[0]
      return showDate === dateStr
    })

    const dayBlocks = blocks.filter((b) =>
      b.start_date <= dateStr && b.end_date >= dateStr
    )

    const hasConflict = dayShows.some((show) =>
      dayBlocks.some((block) => blocksOverlapShow(block, show))
    )

    dayMap[dateStr] = { shows: dayShows, blocks: dayBlocks, hasConflict }
  }

  const selectedDayInfo = selectedDate ? dayMap[selectedDate] : null

  // Blocks that conflict with any show this month
  const conflictingBlockIds = new Set<string>()
  shows.forEach((show) => {
    blocks.forEach((block) => {
      if (blocksOverlapShow(block, show)) {
        conflictingBlockIds.add(block.id)
      }
    })
  })

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    display: 'block',
    color: '#444',
  }

  if (personFound === false) {
    return (
      <section>
        <h3 style={{ marginTop: 0 }}>My Availability</h3>
        <div style={{
          background: '#fffbf0',
          border: '1px solid #ffe0a0',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 14,
          color: '#7a5500',
          maxWidth: 480,
        }}>
          &#9888;&#65039; Your email wasn&apos;t matched to a roster entry in this project. Ask your project owner to add your email address to your roster entry so you can manage your availability.
        </div>
      </section>
    )
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>My Availability</h3>
      <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20, maxWidth: 520 }}>
        Your assigned shows and unavailability blocks. Click a date to see details or manage your blocks.
      </p>

      {errorMsg && (
        <p style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { color: '#6c47ff', bg: '#f0ecff', label: 'Show assigned' },
          { color: '#c8860a', bg: '#fff8dd', label: 'Unavailable' },
          { color: '#cc0000', bg: '#ffdddd', label: 'Conflict' },
        ].map(({ color, bg, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: `1.5px solid ${color}` }} />
            <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333' }}
        >
          &#8249;
        </button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>
          {formatMonthYear(viewYear, viewMonth)}
        </div>
        <button
          onClick={nextMonth}
          style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333' }}
        >
          &#8250;
        </button>
        {loading && <span style={{ fontSize: 13, color: '#999' }}>Loading&#8230;</span>}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, maxWidth: 420, marginBottom: 24 }}>
        {dayLabels.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#888', paddingBottom: 4 }}>
            {d}
          </div>
        ))}

        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = toDateStr(viewYear, viewMonth, day)
          const info = dayMap[dateStr]
          const hasShow = info?.shows.length > 0
          const hasBlock = info?.blocks.length > 0
          const hasConflict = info?.hasConflict
          const isToday = dateStr === today
          const isPast = dateStr < today
          const isSelected = selectedDate === dateStr
          const isClickable = hasShow || hasBlock

          let bg = isPast ? '#fafafa' : 'white'
          let border = isPast ? '#eee' : '#e5e5e5'
          let dotColor = ''

          if (hasConflict) { bg = '#ffdddd'; border = '#ffaaaa'; dotColor = '#cc0000' }
          else if (hasShow && hasBlock) { bg = '#ffdddd'; border = '#ffaaaa'; dotColor = '#cc0000' }
          else if (hasShow) { bg = '#f0ecff'; border = '#c4b5fd'; dotColor = '#6c47ff' }
          else if (hasBlock) { bg = '#fff8dd'; border = '#ffe080'; dotColor = '#c8860a' }

          if (isSelected) { border = '#333' }

          return (
            <div
              key={dateStr}
              onClick={() => isClickable && setSelectedDate(isSelected ? null : dateStr)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: `${isSelected ? 2 : 1.5}px solid ${border}`,
                background: bg,
                cursor: isClickable ? 'pointer' : 'default',
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.1s',
              }}
            >
              <span style={{
                fontSize: 12,
                fontWeight: isToday ? 700 : 400,
                color: isPast ? '#ccc' : '#333',
              }}>
                {day}
              </span>
              {dotColor && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor, marginTop: 1 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedDate && selectedDayInfo && (
        <div style={{
          border: '1px solid #e5e5e5',
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          background: 'white',
          maxWidth: 480,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </div>

          {selectedDayInfo.shows.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6c47ff', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Your Shows
              </div>
              {selectedDayInfo.shows.map((show) => (
                <div key={show.id} style={{ padding: '8px 10px', background: '#f0ecff', border: '1px solid #c4b5fd', borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{show.title}</div>
                  {show.venue_name && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>&#128205; {show.venue_name}</div>}
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {formatShowTime(show.starts_at)} &ndash; {formatShowTime(show.ends_at)}
                  </div>
                  {show.role_name && <div style={{ fontSize: 12, color: '#6c47ff', marginTop: 4, fontWeight: 500 }}>{show.role_name}</div>}
                </div>
              ))}
            </div>
          )}

          {selectedDayInfo.blocks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#c8860a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Your Unavailability
              </div>
              {selectedDayInfo.blocks.map((block) => (
                <div key={block.id} style={{
                  padding: '8px 10px',
                  background: conflictingBlockIds.has(block.id) ? '#ffdddd' : '#fffbf0',
                  border: `1px solid ${conflictingBlockIds.has(block.id) ? '#ffaaaa' : '#ffe0a0'}`,
                  borderRadius: 6,
                  marginBottom: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}>
                  <div>
                    {conflictingBlockIds.has(block.id) && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#cc0000', marginBottom: 3 }}>&#9888;&#65039; Conflicts with a show</div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {block.start_time && block.end_time
                        ? (() => {
                            const fmt = (t: string) => {
                              const [h, m] = t.split(':').map(Number)
                              const ampm = h >= 12 ? 'pm' : 'am'
                              const hour = h % 12 || 12
                              return `${hour}:${String(m).padStart(2, '0')}${ampm}`
                            }
                            return `${fmt(block.start_time)} \u2013 ${fmt(block.end_time)}`
                          })()
                        : 'Full day'
                      }
                    </div>
                    {block.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{block.note}</div>}
                  </div>
                  <button
                    onClick={() => deleteBlock(block.id)}
                    style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: '#c00', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedDayInfo.shows.length === 0 && selectedDayInfo.blocks.length === 0 && (
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Nothing scheduled on this day.</p>
          )}
        </div>
      )}

      {/* Add unavailability block */}
      <div style={{ maxWidth: 480 }}>
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: '9px 18px',
              background: '#111',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 24,
            }}
          >
            + Mark myself unavailable
          </button>
        ) : (
          <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Unavailability Block</div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label style={labelStyle}>Start date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label style={labelStyle}>End date</label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="member_full_day"
                checked={form.full_day}
                onChange={(e) => setForm({ ...form, full_day: e.target.checked, start_time: '', end_time: '' })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="member_full_day" style={{ fontSize: 14, cursor: 'pointer', color: '#333' }}>
                Full day block
              </label>
            </div>

            {!form.full_day && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={labelStyle}>Unavailable from</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={labelStyle}>Unavailable until</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              <label style={labelStyle}>Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Out of town, prior commitment"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
              />
            </div>

            {formMsg && <div style={{ fontSize: 13, color: '#c00', marginBottom: 10 }}>{formMsg}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={saveBlock}
                disabled={saving}
                style={{
                  padding: '9px 18px',
                  background: saving ? '#999' : '#111',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  flex: 1,
                }}
              >
                {saving ? 'Saving\u2026' : 'Save Block'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setForm(blankForm); setFormMsg('') }}
                style={{ padding: '9px 18px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, cursor: 'pointer', color: '#555' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* All blocks list */}
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>All My Unavailability Blocks</div>

        {!loading && blocks.length === 0 && (
          <p style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>
            No blocks set &mdash; you are currently available for all dates.
          </p>
        )}

        {blocks.map((block) => (
          <div
            key={block.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '10px 12px',
              border: `1px solid ${conflictingBlockIds.has(block.id) ? '#ffaaaa' : '#e5e5e5'}`,
              background: conflictingBlockIds.has(block.id) ? '#fff5f5' : 'white',
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <div>
              {conflictingBlockIds.has(block.id) && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#cc0000', marginBottom: 2 }}>&#9888;&#65039; Conflicts with a show this month</div>
              )}
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{formatDateRange(block)}</div>
              {block.note && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{block.note}</div>}
            </div>
            <button
              onClick={() => deleteBlock(block.id)}
              style={{
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                color: '#c00',
                cursor: 'pointer',
                marginLeft: 12,
                flexShrink: 0,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
