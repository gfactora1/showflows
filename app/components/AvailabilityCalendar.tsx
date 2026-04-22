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
}

type Block = {
  id: string
  people_id: string
  display_name: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

type DayStatus = 'booked' | 'blocked' | 'clear' | 'past'

type DayData = {
  shows: Show[]
  blocks: Block[]
  status: DayStatus
}

type PopoverData = {
  date: string
  shows: Show[]
  blocks: Block[]
  x: number
  y: number
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function AvailabilityCalendar({ projectId }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [popover, setPopover] = useState<PopoverData | null>(null)

  const today = todayStr()

  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoading(true)
    setErrorMsg('')
    setPopover(null)

    const firstDay = toDateStr(year, month, 1)
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

    try {
      // Load shows with venue name joined
      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('id, title, starts_at, ends_at, venues(name)')
        .eq('project_id', projectId)

      if (showError) throw showError

      // Normalize venue name out of nested object
      const shows: Show[] = (showData ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        venue_name: s.venues?.name ?? null,
      }))

      // Load active people in this project
      const { data: peopleData, error: peopleError } = await supabase
        .from('people')
        .select('id, display_name')
        .eq('project_id', projectId)
        .eq('is_active', true)

      if (peopleError) throw peopleError

      const peopleIds = (peopleData ?? []).map((p: { id: string }) => p.id)
      const peopleMap: Record<string, string> = {}
      ;(peopleData ?? []).forEach((p: { id: string; display_name: string }) => {
        peopleMap[p.id] = p.display_name
      })

      // Load blocks that overlap this month
      let blocks: Block[] = []
      if (peopleIds.length > 0) {
        const { data: blockData, error: blockError } = await supabase
          .from('member_unavailability')
          .select('id, people_id, start_date, end_date, start_time, end_time, note')
          .in('people_id', peopleIds)
          .lte('start_date', lastDay)
          .gte('end_date', firstDay)

        if (blockError) throw blockError

        blocks = (blockData ?? []).map((b: any) => ({
          ...b,
          display_name: peopleMap[b.people_id] ?? 'Unknown',
        }))
      }

      // Build day map for this month
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const newDayMap: Record<string, DayData> = {}

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(year, month, d)
        const isPast = dateStr < today

        const dayShows = shows.filter((s) => {
          const showStart = s.starts_at.split('T')[0]
          const showEnd = s.ends_at.split('T')[0]
          return showStart <= dateStr && showEnd >= dateStr
        })

        const dayBlocks = blocks.filter((b) => {
          return b.start_date <= dateStr && b.end_date >= dateStr
        })

        let status: DayStatus
        if (isPast) {
          status = 'past'
        } else if (dayShows.length > 0) {
          status = 'booked'
        } else if (dayBlocks.length > 0) {
          status = 'blocked'
        } else {
          status = 'clear'
        }

        newDayMap[dateStr] = { shows: dayShows, blocks: dayBlocks, status }
      }

      setDayMap(newDayMap)
    } catch (e: any) {
      setErrorMsg(`Error loading calendar: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [projectId, today])

  useEffect(() => {
    loadMonth(viewYear, viewMonth)
  }, [viewYear, viewMonth, loadMonth])

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const handleDayClick = (dateStr: string, dayData: DayData, e: React.MouseEvent) => {
    if (dayData.shows.length === 0 && dayData.blocks.length === 0) {
      setPopover(null)
      return
    }
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPopover({
      date: dateStr,
      shows: dayData.shows,
      blocks: dayData.blocks,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 6,
    })
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()

  const dayColors: Record<DayStatus, string> = {
    booked: '#ffdddd',
    blocked: '#fff8dd',
    clear: '#edfff3',
    past: '#f5f5f5',
  }

  const dayBorders: Record<DayStatus, string> = {
    booked: '#ffaaaa',
    blocked: '#ffe080',
    clear: '#b2f0c8',
    past: '#e5e5e5',
  }

  const dayDots: Record<DayStatus, string> = {
    booked: '#cc0000',
    blocked: '#c8860a',
    clear: '#1a7a3a',
    past: '#ccc',
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Availability</h3>
      <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20, maxWidth: 520 }}>
        Monthly view of shows and member availability. Click any highlighted date for details.
      </p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { color: '#cc0000', bg: '#ffdddd', label: 'Show booked' },
          { color: '#c8860a', bg: '#fff8dd', label: 'Member blocked' },
          { color: '#1a7a3a', bg: '#edfff3', label: 'Clear' },
        ].map(({ color, bg, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              background: bg, border: `1.5px solid ${color}`,
            }} />
            <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{
            background: 'none', border: '1px solid #ddd', borderRadius: 6,
            padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333',
          }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>
          {formatMonthYear(viewYear, viewMonth)}
        </div>
        <button
          onClick={nextMonth}
          style={{
            background: 'none', border: '1px solid #ddd', borderRadius: 6,
            padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#333',
          }}
        >
          ›
        </button>
        {loading && <span style={{ fontSize: 13, color: '#999' }}>Loading…</span>}
      </div>

      {errorMsg && (
        <p style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
      )}

      {/* Calendar grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4,
        maxWidth: 560,
      }}>
        {/* Day headers */}
        {dayLabels.map((d) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 12, fontWeight: 600,
            color: '#888', paddingBottom: 6,
          }}>
            {d}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = toDateStr(viewYear, viewMonth, day)
          const dayData = dayMap[dateStr]
          const status = dayData?.status ?? 'clear'
          const isToday = dateStr === today
          const hasDetail = dayData && (dayData.shows.length > 0 || dayData.blocks.length > 0)
          const isSelected = popover?.date === dateStr

          return (
            <div
              key={dateStr}
              onClick={(e) => dayData && handleDayClick(dateStr, dayData, e)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: isSelected
                  ? '2px solid #333'
                  : `1.5px solid ${dayData ? dayBorders[status] : '#e5e5e5'}`,
                background: dayData ? dayColors[status] : '#f9f9f9',
                cursor: hasDetail ? 'pointer' : 'default',
                position: 'relative',
                transition: 'transform 0.1s',
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? '#111' : status === 'past' ? '#bbb' : '#333',
              }}>
                {day}
              </span>
              {isToday && (
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: '#333', marginTop: 2,
                }} />
              )}
              {hasDetail && !isToday && (
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: dayDots[status], marginTop: 2,
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Popover */}
      {popover && (
        <>
          <div
            onClick={() => setPopover(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: 'fixed',
            top: Math.min(popover.y, window.innerHeight - 320),
            left: Math.min(popover.x, window.innerWidth - 300),
            zIndex: 100,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 10,
            padding: 16,
            minWidth: 260,
            maxWidth: 300,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#111' }}>
              {formatDate(popover.date)}
            </div>

            {/* Shows */}
            {popover.shows.length > 0 && (
              <div style={{ marginBottom: popover.blocks.length > 0 ? 12 : 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: '#cc0000',
                  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
                }}>
                  {popover.shows.length === 1 ? 'Show Booked' : `${popover.shows.length} Shows Booked`}
                </div>
                {popover.shows.map((show) => (
                  <div key={show.id} style={{
                    padding: '8px 10px',
                    background: '#fff0f0',
                    border: '1px solid #ffcccc',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{show.title}</div>
                    {show.venue_name && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                        📍 {show.venue_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Blocks */}
            {popover.blocks.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: '#c8860a',
                  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
                }}>
                  Member Blocks
                </div>
                {popover.blocks.map((block) => (
                  <div key={block.id} style={{
                    padding: '8px 10px',
                    background: '#fffbf0',
                    border: '1px solid #ffe0a0',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{block.display_name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {block.start_time && block.end_time
                        ? `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`
                        : 'Full day'
                      }
                    </div>
                    {block.note && (
                      <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{block.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setPopover(null)}
              style={{
                marginTop: 10, width: '100%', padding: '6px 0',
                background: 'none', border: '1px solid #ddd', borderRadius: 6,
                fontSize: 12, color: '#666', cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </>
      )}
    </section>
  )
}
