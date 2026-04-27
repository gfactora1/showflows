'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

type Props = { projectId: string }

type PersonResult = {
  id: string
  display_name: string
  blocks: {
    start_date: string
    end_date: string
    start_time: string | null
    end_time: string | null
    note: string | null
  }[]
}

type ExistingShow = {
  id: string
  title: string
  starts_at: string
  ends_at: string
}

type OverviewStatus = 'idle' | 'loading' | 'done' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatShowDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTimeRange(start: string, end: string) {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 || 12
    return `${hour}:${String(m).padStart(2, '0')}${ampm}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function today() { return new Date().toISOString().split('T')[0] }

function daysFromToday(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function showOverlapsRange(startsAt: string, endsAt: string, rangeStart: string, rangeEnd: string) {
  const showStart = startsAt.split('T')[0]
  const showEnd   = endsAt.split('T')[0]
  return showStart <= rangeEnd && showEnd >= rangeStart
}

// ── Result card style factory ─────────────────────────────────────────────────
//
//  Three variants: red (booked), amber (has blocks), green (all clear)
//  All share: dark bg + 4px left border accent + faint tinted background
//  This keeps them native to the dark UI while signalling meaning clearly

function resultCard(accent: 'red' | 'amber' | 'green'): React.CSSProperties {
  const map = {
    red:   { border: colors.red,   bg: 'rgba(252,129,129,0.06)'  },
    amber: { border: colors.amber, bg: 'rgba(245,158,11,0.06)'   },
    green: { border: colors.green, bg: 'rgba(34,197,94,0.06)'    },
  }
  const { border, bg } = map[accent]
  return {
    background: bg,
    border: `1px solid rgba(255,255,255,0.07)`,
    borderLeft: `4px solid ${border}`,
    borderRadius: radius.lg,
    padding: '16px 18px',
    marginBottom: 16,
  }
}

function iconBox(soft: string): React.CSSProperties {
  return {
    width: 28, height: 28,
    background: soft,
    borderRadius: radius.sm,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, flexShrink: 0,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AvailabilityOverview({ projectId }: Props) {
  const [startDate, setStartDate]         = useState(today())
  const [endDate, setEndDate]             = useState(daysFromToday(90))
  const [status, setStatus]               = useState<OverviewStatus>('idle')
  const [existingShows, setExistingShows] = useState<ExistingShow[]>([])
  const [people, setPeople]               = useState<PersonResult[]>([])
  const [errorMsg, setErrorMsg]           = useState('')

  const checkAvailability = async () => {
    if (!startDate || !endDate) return
    if (endDate < startDate) { setErrorMsg('End date must be on or after start date.'); return }
    setErrorMsg('')
    setStatus('loading')

    try {
      const { data: showData, error: showError } = await supabase
        .from('shows').select('id, title, starts_at, ends_at').eq('project_id', projectId)
      if (showError) throw showError

      const overlapping = (showData ?? []).filter((s: ExistingShow) =>
        showOverlapsRange(s.starts_at, s.ends_at, startDate, endDate)
      )
      setExistingShows(overlapping)

      if (overlapping.length > 0) { setPeople([]); setStatus('done'); return }

      const { data: peopleData, error: peopleError } = await supabase
        .from('people').select('id, display_name')
        .eq('project_id', projectId).eq('is_active', true)
        .order('display_name', { ascending: true })
      if (peopleError) throw peopleError

      const activePeople = peopleData ?? []
      if (activePeople.length === 0) { setPeople([]); setStatus('done'); return }

      const peopleIds = activePeople.map((p: { id: string }) => p.id)
      const { data: blockData, error: blockError } = await supabase
        .from('member_unavailability')
        .select('people_id, start_date, end_date, start_time, end_time, note')
        .in('people_id', peopleIds).lte('start_date', endDate).gte('end_date', startDate)
      if (blockError) throw blockError

      const blocks = blockData ?? []
      const results: PersonResult[] = activePeople.map((p: { id: string; display_name: string }) => ({
        id: p.id,
        display_name: p.display_name,
        blocks: blocks
          .filter((b: any) => b.people_id === p.id)
          .map((b: any) => ({
            start_date: b.start_date, end_date: b.end_date,
            start_time: b.start_time, end_time: b.end_time, note: b.note,
          })),
      }))

      setPeople(results)
      setStatus('done')
    } catch (e: any) {
      setErrorMsg(`Error checking availability: ${e?.message ?? String(e)}`)
      setStatus('error')
    }
  }

  useEffect(() => { checkAvailability() }, [projectId])

  const blockedPeople = people.filter((p) => p.blocks.length > 0)
  const clearPeople   = people.filter((p) => p.blocks.length === 0)
  const isBooked      = existingShows.length > 0

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    background: colors.elevated,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radius.md,
    fontSize: 13,
    color: colors.textPrimary,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: font.sans,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 5,
    display: 'block',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 8,
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Availability Overview
      </h3>
      <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20, maxWidth: 520, lineHeight: 1.5 }}>
        Check if the band is available for a date range. Shows and member blocks are checked together.
      </p>

      {/* Date range picker */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>To</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </div>
        <button
          onClick={checkAvailability}
          disabled={status === 'loading'}
          style={{
            padding: '8px 20px',
            background: status === 'loading' ? colors.elevated : colors.violet,
            color: status === 'loading' ? colors.textMuted : 'white',
            border: 'none',
            borderRadius: radius.md,
            fontSize: 13,
            fontWeight: 600,
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            height: 38,
            fontFamily: font.sans,
            transition: `background ${transition.normal}`,
          }}
        >
          {status === 'loading' ? 'Checking…' : 'Check Availability'}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: colors.red, fontSize: 13, marginBottom: 16 }}>{errorMsg}</p>
      )}

      {status === 'done' && (
        <div>

          {/* ── Already Booked ────────────────────────────────────────────── */}
          {isBooked && (
            <div style={resultCard('red')}>

              {/* Heading row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={iconBox(colors.redSoft)}>⚠</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.red, lineHeight: 1 }}>
                    Already Booked
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
                    {existingShows.length === 1 ? 'A show is' : 'Shows are'} scheduled during this period
                  </div>
                </div>
              </div>

              {/* Show list — dark nested cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {existingShows.map((show) => (
                  <div key={show.id} style={{
                    background: colors.card,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    padding: '10px 13px',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>
                      {show.title}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
                      {formatShowDate(show.starts_at)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Guidance — lowest emphasis */}
              <div style={{ fontSize: 12, color: colors.textMuted }}>
                The band is committed for this period. Try a different date range.
              </div>
            </div>
          )}

          {/* ── No show — member breakdown ────────────────────────────────── */}
          {!isBooked && (
            <>
              {/* Summary banner */}
              {blockedPeople.length === 0 ? (
                <div style={resultCard('green')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={iconBox(colors.greenSoft)}>✓</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: colors.green }}>
                        Everyone is available
                      </div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
                        No blocks for {formatDate(startDate)} — {formatDate(endDate)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={resultCard('amber')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={iconBox(colors.amberSoft)}>⚠</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: colors.amber }}>
                        {blockedPeople.length} {blockedPeople.length === 1 ? 'member has' : 'members have'} blocks in this period
                      </div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
                        Fill-ins may be needed. See details below.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Blocked members */}
              {blockedPeople.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={sectionLabel}>Has Blocks</div>
                  {blockedPeople.map((person) => (
                    <div key={person.id} style={{
                      background: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderLeft: `3px solid ${colors.amber}`,
                      borderRadius: radius.lg,
                      padding: '12px 14px',
                      marginBottom: 8,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary, marginBottom: 8 }}>
                        {person.display_name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {person.blocks.map((block, i) => (
                          <div key={i} style={{
                            fontSize: 12,
                            padding: '6px 10px',
                            background: colors.elevated,
                            borderRadius: radius.sm,
                          }}>
                            <span style={{ fontWeight: 500, color: colors.textPrimary }}>
                              {block.start_date === block.end_date
                                ? formatDate(block.start_date)
                                : `${formatDate(block.start_date)} — ${formatDate(block.end_date)}`}
                            </span>
                            {block.start_time && block.end_time
                              ? <span style={{ color: colors.textMuted }}> · {formatTimeRange(block.start_time, block.end_time)}</span>
                              : <span style={{ color: colors.textMuted }}> · full day</span>
                            }
                            {block.note && (
                              <span style={{ color: colors.textMuted }}> · {block.note}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available members */}
              {clearPeople.length > 0 && (
                <div>
                  <div style={sectionLabel}>Available</div>
                  {clearPeople.map((person) => (
                    <div key={person.id} style={{
                      background: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.md,
                      padding: '9px 13px',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: colors.green, flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 500, fontSize: 13, color: colors.textPrimary }}>
                        {person.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {people.length === 0 && (
                <p style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>
                  No active members found in this project.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
