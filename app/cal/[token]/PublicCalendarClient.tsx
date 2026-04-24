'use client'

import { useEffect, useState } from 'react'

type Show = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  project_name: string
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  role_name: string | null
}

type CalendarData = {
  name: string
  shows: Show[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function groupByMonth(shows: Show[]): { month: string; shows: Show[] }[] {
  const map = new Map<string, Show[]>()
  for (const show of shows) {
    const month = formatMonth(show.starts_at)
    if (!map.has(month)) map.set(month, [])
    map.get(month)!.push(show)
  }
  return Array.from(map.entries()).map(([month, shows]) => ({ month, shows }))
}

function getDayOfWeek(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}

function getDayNumber(iso: string) {
  return new Date(iso).getDate()
}

export default function PublicCalendarClient({ token }: { token: string }) {
  const [data, setData] = useState<CalendarData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const icalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/cal/${token}/ical`
    : ''

  useEffect(() => {
    fetch(`/api/cal/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Could not load calendar.'))
      .finally(() => setLoading(false))
  }, [token])

  const grouped = data ? groupByMonth(data.shows) : []

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0c0c0e;
        }

        .cal-root {
          min-height: 100vh;
          background: #0c0c0e;
          color: #e8e4dc;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        .cal-noise {
          position: fixed;
          inset: 0;
          opacity: 0.035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 256px;
          pointer-events: none;
          z-index: 0;
        }

        .cal-glow {
          position: fixed;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 800px;
          height: 500px;
          background: radial-gradient(ellipse, rgba(180, 140, 80, 0.12) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .cal-content {
          position: relative;
          z-index: 1;
          max-width: 680px;
          margin: 0 auto;
          padding: 60px 24px 80px;
        }

        .cal-header {
          text-align: center;
          margin-bottom: 56px;
        }

        .cal-brand {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #b8924a;
          margin-bottom: 20px;
        }

        .cal-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(36px, 7vw, 56px);
          font-weight: 700;
          line-height: 1.1;
          color: #f0ebe0;
          margin-bottom: 8px;
        }

        .cal-subtitle {
          font-size: 14px;
          color: #666;
          font-weight: 300;
          letter-spacing: 0.3px;
        }

        .cal-divider {
          width: 40px;
          height: 1px;
          background: #b8924a;
          margin: 24px auto;
          opacity: 0.6;
        }

        .cal-ical-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 18px;
          background: transparent;
          border: 1px solid rgba(184, 146, 74, 0.4);
          border-radius: 100px;
          color: #b8924a;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
        }

        .cal-ical-btn:hover {
          background: rgba(184, 146, 74, 0.08);
          border-color: rgba(184, 146, 74, 0.7);
        }

        .cal-month-group {
          margin-bottom: 48px;
        }

        .cal-month-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #1e1e22;
        }

        .cal-show-card {
          display: grid;
          grid-template-columns: 52px 1fr;
          gap: 0 20px;
          padding: 20px 0;
          border-bottom: 1px solid #1a1a1e;
          transition: opacity 0.15s;
        }

        .cal-show-card:last-child {
          border-bottom: none;
        }

        .cal-date-col {
          text-align: center;
          padding-top: 2px;
        }

        .cal-day-name {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #b8924a;
          margin-bottom: 2px;
        }

        .cal-day-num {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 30px;
          font-weight: 400;
          color: #f0ebe0;
          line-height: 1;
        }

        .cal-show-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 20px;
          font-weight: 400;
          color: #f0ebe0;
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .cal-show-band {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #b8924a;
          margin-bottom: 8px;
        }

        .cal-show-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .cal-meta-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          color: #666;
          font-weight: 300;
        }

        .cal-meta-icon {
          color: #444;
          font-size: 12px;
        }

        .cal-empty {
          text-align: center;
          padding: 80px 0;
        }

        .cal-empty-icon {
          font-size: 40px;
          margin-bottom: 16px;
          opacity: 0.4;
        }

        .cal-empty-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 22px;
          color: #555;
          margin-bottom: 8px;
        }

        .cal-empty-sub {
          font-size: 14px;
          color: #444;
          font-weight: 300;
        }

        .cal-error {
          text-align: center;
          padding: 80px 0;
        }

        .cal-footer {
          text-align: center;
          margin-top: 60px;
          padding-top: 32px;
          border-top: 1px solid #1a1a1e;
        }

        .cal-footer-text {
          font-size: 12px;
          color: #333;
          letter-spacing: 0.3px;
        }

        .cal-footer-link {
          color: #555;
          text-decoration: none;
        }

        .cal-footer-link:hover {
          color: #b8924a;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cal-animate {
          animation: fadeUp 0.5s ease both;
        }

        .cal-animate-delay-1 { animation-delay: 0.05s; }
        .cal-animate-delay-2 { animation-delay: 0.1s; }
        .cal-animate-delay-3 { animation-delay: 0.15s; }
      `}</style>

      <div className="cal-root">
        <div className="cal-noise" />
        <div className="cal-glow" />

        <div className="cal-content">

          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 120, color: '#444', fontSize: 14 }}>
              Loading…
            </div>
          )}

          {error && (
            <div className="cal-error">
              <div className="cal-empty-icon">🔗</div>
              <div className="cal-empty-title" style={{ color: '#555' }}>
                {error}
              </div>
              <div className="cal-empty-sub">
                This link may have been revoked or is invalid.
              </div>
            </div>
          )}

          {data && (
            <>
              <div className="cal-header cal-animate">
                <div className="cal-brand">ShowFlows</div>
                <div className="cal-name">{data.name}</div>
                <div className="cal-subtitle">Upcoming Shows & Performances</div>
                <div className="cal-divider" />
                {icalUrl && (
                  <a href={icalUrl} className="cal-ical-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Subscribe to calendar
                  </a>
                )}
              </div>

              {data.shows.length === 0 ? (
                <div className="cal-empty cal-animate cal-animate-delay-1">
                  <div className="cal-empty-icon">🎸</div>
                  <div className="cal-empty-title">No upcoming shows for {data.name}</div>
                  <div className="cal-empty-sub">Check back soon — new dates may be added.</div>
                </div>
              ) : (
                grouped.map(({ month, shows }, groupIdx) => (
                  <div
                    key={month}
                    className={`cal-month-group cal-animate cal-animate-delay-${Math.min(groupIdx + 1, 3)}`}
                  >
                    <div className="cal-month-label">{month}</div>

                    {shows.map((show) => {
                      const venueParts = [show.venue_name, show.venue_city, show.venue_state].filter(Boolean)
                      const venueDisplay = venueParts.join(', ')

                      return (
                        <div key={show.id} className="cal-show-card">
                          <div className="cal-date-col">
                            <div className="cal-day-name">{getDayOfWeek(show.starts_at)}</div>
                            <div className="cal-day-num">{getDayNumber(show.starts_at)}</div>
                          </div>

                          <div>
                            <div className="cal-show-band">{show.project_name}</div>
                            <div className="cal-show-title">{show.title}</div>
                            <div className="cal-show-meta">
                              <span className="cal-meta-item">
                                <span className="cal-meta-icon">🕐</span>
                                {formatTime(show.starts_at)} – {formatTime(show.ends_at)}
                              </span>
                              {venueDisplay && (
                                <span className="cal-meta-item">
                                  <span className="cal-meta-icon">📍</span>
                                  {venueDisplay}
                                </span>
                              )}
                              {show.role_name && (
                                <span className="cal-meta-item">
                                  <span className="cal-meta-icon">🎵</span>
                                  {show.role_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              )}

              <div className="cal-footer">
                <p className="cal-footer-text">
                  Powered by{' '}
                  <a href="https://showflows.net" className="cal-footer-link">
                    ShowFlows
                  </a>
                  {' '}· Schedule management for live performers
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
