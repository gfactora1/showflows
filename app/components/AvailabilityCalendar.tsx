'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

type Props = {
  projectId: string
}

type Show = {
  id: string
  title: string
  starts_at: string
  ends_at: string
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

type DayStatus = 'booked' | 'blocked' | 'both' | 'clear' | 'past'

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

// ── Status appearance map ─────────────────────────────────────────────────────
const STATUS_STYLE: Record<DayStatus, { bg: string; border: string; dot: string }> = {
  booked:  { bg: colors.redSoft,   border: 'rgba(239,68,68,0.5)',    dot: colors.red },
  blocked: { bg: colors.amberSoft, border: 'rgba(245,158,11,0.5)',   dot: colors.amber },
  both:    { bg: colors.redSoft,   border: 'rgba(239,68,68,0.5)',    dot: colors.red },
  clear:   { bg: colors.greenSoft, border: 'rgba(34,197,94,0.35)',   dot: colors.green },
  past:    { bg: colors.card,      border: colors.border,             dot: colors.textDim },
}

export default function AvailabilityCalendar({ projectId }: Props) {
  const now = new Date()
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [dayMap, setDayMap]       = useState<Record<string, DayData>>({})
  const [loading, setLoading]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')
  const [popover, setPopover]     = useState<PopoverData | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  const today = todayStr()

  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoading(true)
    setErrorMsg('')
    setPopover(null)

    const firstDay = toDateStr(year, month, 1)
    const lastDay  = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

    try {
      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('id, title, starts_at, ends_at')
        .eq('project_id', projectId)

      if (showError) throw showError

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

      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const newDayMap: Record<string, DayData> = {}

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(year, month, d)
        const isPast  = dateStr < today

        const dayShows = (showData ?? []).filter((s: Show) => {
          const showStart = s.starts_at.split('T')[0]
          const showEnd   = s.ends_at.split('T')[0]
          return showStart <= dateStr && showEnd >= dateStr
        })

        const dayBlocks = blocks.filter((b) => b.start_date <= dateStr && b.end_date >= dateStr)

        let status: DayStatus
        if (isPast) {
          status = 'past'
        } else if (dayShows.length > 0 && dayBlocks.length > 0) {
          status = 'both'
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
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (dateStr: string, dayData: DayData, e: React.MouseEvent) => {
    if (dayData.shows.length === 0 && dayData.blocks.length === 0) {
      setPopover(null)
      return
    }
    if (popover?.date === dateStr) {
      setPopover(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({
      date: dateStr,
      shows: dayData.shows,
      blocks: dayData.blocks,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 6,
    })
  }

  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const dayLabels      = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, color: colors.textPrimary, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
        Availability
      </h3>
      <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20, maxWidth: 520 }}>
        Monthly view of shows and member availability blocks. Click any highlighted date for details.
      </p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { style: STATUS_STYLE.booked,  label: 'Show booked' },
          { style: STATUS_STYLE.blocked, label: 'Member blocked' },
          { style: STATUS_STYLE.clear,   label: 'Clear' },
        ].map(({ style, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: radius.sm,
              background: style.bg, border: `1.5px solid ${style.border}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{
            background: colors.card, border: `1px solid ${colors.border}`,
            borderRadius: radius.md, padding: '6px 12px', cursor: 'pointer',
            fontSize: 16, color: colors.textSecondary, fontFamily: font.sans,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colors.elevated)}
          onMouseLeave={(e) => (e.currentTarget.style.background = colors.card)}
        >‹</button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign: 'center', color: colors.textPrimary }}>
          {formatMonthYear(viewYear, viewMonth)}
        </div>
        <button
          onClick={nextMonth}
          style={{
            background: colors.card, border: `1px solid ${colors.border}`,
            borderRadius: radius.md, padding: '6px 12px', cursor: 'pointer',
            fontSize: 16, color: colors.textSecondary, fontFamily: font.sans,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colors.elevated)}
          onMouseLeave={(e) => (e.currentTarget.style.background = colors.card)}
        >›</button>
        {loading && <span style={{ fontSize: 13, color: colors.textMuted }}>Loading…</span>}
      </div>

      {errorMsg && (
        <p style={{ color: colors.red, fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
      )}

      {/* ── Calendar ── */}
      {/* cal* are grid-local constants — intentionally outside system tokens */}
      {(() => {
        const calContainer    = '#131424'
        const calCell         = '#3E4268'
        const calPastCell     = '#2E3152'
        const calCellHover    = '#4A4F7A'
        const calBorderFuture = 'rgba(255,255,255,0.18)'
        const calBorderPast   = 'rgba(255,255,255,0.10)'

        const STATUS_STRONG: Record<DayStatus, { bg: string; border: string; dot: string }> = {
          booked:  { bg: 'rgba(239,68,68,0.25)',    border: 'rgba(239,68,68,0.75)',   dot: colors.red },
          blocked: { bg: 'rgba(245,158,11,0.25)',   border: 'rgba(245,158,11,0.75)',  dot: colors.amber },
          both:    { bg: 'rgba(239,68,68,0.25)',    border: 'rgba(239,68,68,0.75)',   dot: colors.red },
          clear:   { bg: 'rgba(34,197,94,0.18)',    border: 'rgba(34,197,94,0.6)',    dot: colors.green },
          past:    { bg: calPastCell,               border: calBorderPast,            dot: colors.textMuted },
        }

        return (
          <div style={{
            background: calContainer,
            border: `1px solid rgba(255,255,255,0.1)`,
            borderRadius: radius.xl,
            padding: 12,
            maxWidth: 560,
          }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {dayLabels.map((d) => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 600,
                  color: colors.textSecondary, paddingBottom: 6, letterSpacing: '0.04em',
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day       = i + 1
                const dateStr   = toDateStr(viewYear, viewMonth, day)
                const dayData   = dayMap[dateStr]
                const status    = dayData?.status ?? 'clear'
                const isToday   = dateStr === today
                const hasDetail = !!(dayData && (dayData.shows.length > 0 || dayData.blocks.length > 0))
                const isSelected = popover?.date === dateStr
                const isPast    = dateStr < today
                const isHovered = hoveredDate === dateStr && !isSelected

                const st = STATUS_STRONG[status]

                // NO opacity — color-only dimming for uniform row brightness
                // Status fills (redSoft/amberSoft/greenSoft) ARE the brightness signal for this calendar
                let bg        = isPast ? calPastCell : (hasDetail ? st.bg : calCell)
                let border    = isPast ? calBorderPast : (hasDetail ? st.border : calBorderFuture)
                let bw        = hasDetail ? '1.5px' : '1px'
                let numColor  = isPast ? colors.textDim : colors.textPrimary
                let boxShadow = 'none'
                let dotOpacity = isPast ? 0.5 : 1

                if (isSelected) {
                  bg = colors.violet; border = colors.violet; bw = '2px'; numColor = '#fff'; boxShadow = 'none'; dotOpacity = 1
                } else if (isToday) {
                  if (!hasDetail) bg = 'rgba(41,95,255,0.15)'
                  border = colors.blue; bw = '2px'; numColor = colors.textPrimary
                  boxShadow = '0 0 0 2px rgba(41,95,255,0.25)'
                }

                if (isHovered) { bg = calCellHover; boxShadow = 'none' }

                return (
                  <div
                    key={dateStr}
                    onClick={(e) => dayData && handleDayClick(dateStr, dayData, e)}
                    onMouseEnter={() => setHoveredDate(dateStr)}
                    onMouseLeave={() => setHoveredDate(null)}
                    style={{
                      aspectRatio: '1',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: radius.md,
                      border: `${bw} solid ${border}`,
                      background: bg,
                      boxShadow,
                      cursor: hasDetail ? 'pointer' : 'default',
                      transition: `background ${transition.fast}`,
                      userSelect: 'none',
                    }}
                  >
                    <span style={{
                      fontSize: 13, fontWeight: (isToday || hasDetail) ? 600 : 400,
                      color: numColor, lineHeight: 1,
                    }}>
                      {day}
                    </span>
                    {(hasDetail || isToday) && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: hasDetail ? st.dot : colors.blue,
                        marginTop: 2, flexShrink: 0,
                        opacity: hasDetail ? dotOpacity : 1,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Popover ── */}
      {popover && (
        <>
          <div
            onClick={() => setPopover(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: 'fixed',
            top: Math.min(popover.y, window.innerHeight - 300),
            left: Math.min(popover.x, window.innerWidth - 320),
            zIndex: 100,
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radius.xl,
            padding: 16,
            minWidth: 260,
            maxWidth: 310,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: colors.textPrimary }}>
              {formatDate(popover.date)}
            </div>

            {/* Shows */}
            {popover.shows.length > 0 && (
              <div style={{ marginBottom: popover.blocks.length > 0 ? 12 : 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: colors.red,
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
                }}>
                  Show Booked
                </div>
                {popover.shows.map((show) => (
                  <div key={show.id} style={{
                    padding: '8px 10px',
                    background: colors.redSoft,
                    border: `1px solid rgba(239,68,68,0.3)`,
                    borderRadius: radius.md,
                    marginBottom: 5,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>{show.title}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Blocks */}
            {popover.blocks.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: colors.amber,
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
                }}>
                  Member Blocks
                </div>
                {popover.blocks.map((block) => (
                  <div key={block.id} style={{
                    padding: '8px 10px',
                    background: colors.amberSoft,
                    border: `1px solid rgba(245,158,11,0.3)`,
                    borderRadius: radius.md,
                    marginBottom: 5,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>{block.display_name}</div>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {block.start_time && block.end_time
                        ? `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`
                        : 'Full day'}
                    </div>
                    {block.note && (
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' }}>{block.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setPopover(null)}
              style={{
                marginTop: 10, width: '100%', padding: '7px 0',
                background: 'transparent', border: `1px solid ${colors.border}`,
                borderRadius: radius.md, fontSize: 12, color: colors.textSecondary,
                cursor: 'pointer', fontFamily: font.sans,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.elevated)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Close
            </button>
          </div>
        </>
      )}
    </section>
  )
}
