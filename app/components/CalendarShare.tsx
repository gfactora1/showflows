'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

// ── Token usage in this component ────────────────────────────────────────────
//  textPrimary   → section title, "Preview" button text, ghost button labels
//  textSecondary → card section labels ("WEB CALENDAR"), description text
//  textMuted     → helper / instructional text (Apple/Google instructions)
//  textUrl       → URL input text — brighter than primary to signal "copy me"
//  red           → "Revoke link" — destructive, fontWeight 500

export default function CalendarShare() {
  const [token, setToken]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking]     = useState(false)
  const [copied, setCopied]         = useState<'web' | 'ical' | null>(null)
  const [msg, setMsg]               = useState('')
  const [expanded, setExpanded]     = useState(false)  // collapsed by default

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const webUrl  = token ? `${baseUrl}/cal/${token}` : ''
  const icalUrl = token ? `${baseUrl}/api/cal/${token}/ical` : ''

  useEffect(() => { loadToken() }, [])

  const loadToken = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('calendar_shares').select('id')
      .eq('auth_user_id', user.id).eq('revoked', false).maybeSingle()
    setToken(data?.id ?? null)
    setLoading(false)
  }

  const generateToken = async () => {
    setGenerating(true); setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('calendar_shares').insert({ auth_user_id: user.id }).select('id').single()
    if (error) setMsg('Error generating link. Try again.')
    else setToken(data.id)
    setGenerating(false)
  }

  const revokeToken = async () => {
    if (!token) return
    if (!confirm('This will permanently break your current shareable link. Anyone using it will lose access.\n\nContinue?')) return
    setRevoking(true); setMsg('')
    const { error } = await supabase
      .from('calendar_shares').update({ revoked: true }).eq('id', token)
    if (error) setMsg('Error revoking link. Try again.')
    else setToken(null)
    setRevoking(false)
  }

  const copyToClipboard = async (type: 'web' | 'ical') => {
    const url = type === 'web' ? webUrl : icalUrl
    try {
      await navigator.clipboard.writeText(url)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setMsg('Could not copy — please copy the link manually.')
    }
  }

  if (loading) return null

  // ── Element styles ────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: '16px',
  }

  // "WEB CALENDAR" / "ICAL FEED" — secondary, readable label not dominant heading
  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 5,
  }

  // Description — secondary
  const description: React.CSSProperties = {
    fontSize: 13, color: colors.textSecondary,
    lineHeight: 1.5, marginBottom: 12,
  }

  // Helper / instructional — muted (lowest priority)
  const helper: React.CSSProperties = {
    fontSize: 12, color: colors.textMuted,
    lineHeight: 1.6, marginTop: 10, marginBottom: 0,
  }

  // URL field — near-white text on baseDeep background
  // radius.md matches the card system; violet-tinted border signals "interactive field"
  const urlInput: React.CSSProperties = {
    flex: 1, minWidth: 0,
    padding: '7px 11px',
    background: colors.baseDeep,
    border: `1px solid rgba(124,58,237,0.35)`,  // violet-tinted — intentional, not generic
    borderRadius: radius.md,                      // matches card system (was sm/6px)
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textUrl,
    outline: 'none',
    letterSpacing: '0.01em',
  }

  // "Copy link" — primary action: violet fill
  const copyBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    background: active ? colors.green : colors.violet,
    color: 'white', border: 'none',
    borderRadius: radius.sm,
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: `background ${transition.normal}`,
    fontFamily: font.sans,
  })

  // "Preview" — secondary action: textPrimary text + borderStrong = clearly clickable
  // Distinct from "Copy link" but not passive/disabled
  const previewBtn: React.CSSProperties = {
    padding: '7px 14px',
    background: 'transparent',
    color: colors.textPrimary,       // #F0F2F8 — clearly readable, not ghosted
    border: `1px solid ${colors.borderStrong}`,  // 15% white — visible border
    borderRadius: radius.sm,
    fontSize: 13, fontWeight: 500,
    textDecoration: 'none', whiteSpace: 'nowrap',
    fontFamily: font.sans,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      marginTop: 64,
      paddingTop: 40,
      borderTop: `1px solid ${colors.border}`,
      fontFamily: font.sans,
    }}>

      {/* Clickable header row — toggles expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          marginBottom: expanded ? 6 : 0,
        }}
      >
        <h2 style={{
          fontSize: 16, fontWeight: 800,
          color: colors.textPrimary,
          margin: 0, letterSpacing: '-0.3px',
        }}>
          📅 My Shareable Calendar
        </h2>
        <span style={{
          fontSize: 11,
          color: colors.textMuted,
          transition: `transform ${transition.normal}`,
          display: 'inline-block',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          marginTop: 1,
        }}>
          ▼
        </span>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div>
          {/* Subtitle */}
          <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 20px', lineHeight: 1.5 }}>
            Share your show schedule with anyone — no login required.
          </p>

          {!token ? (
            <div>
              <button
                onClick={generateToken}
                disabled={generating}
                style={{
                  padding: '8px 18px',
                  background: generating ? colors.textDim : colors.violet,
                  color: 'white', border: 'none',
                  borderRadius: radius.md, fontSize: 13, fontWeight: 500,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontFamily: font.sans,
                }}
              >
                {generating ? 'Generating…' : 'Generate shareable link'}
              </button>
              <p style={{ ...helper, marginTop: 10 }}>
                Creates a private link only you can share. Revoke it anytime to cut off access.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>

              {/* Web calendar */}
              <div style={cardStyle}>
                <div style={sectionLabel}>Web Calendar</div>
                <div style={description}>A calendar page anyone can open in their browser.</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={webUrl} style={urlInput} />
                  <button onClick={() => copyToClipboard('web')} style={copyBtn(copied === 'web')}>
                    {copied === 'web' ? '✓ Copied' : 'Copy link'}
                  </button>
                  <a href={webUrl} target="_blank" rel="noopener noreferrer" style={previewBtn}>
                    Preview
                  </a>
                </div>
              </div>

              {/* iCal feed */}
              <div style={cardStyle}>
                <div style={sectionLabel}>iCal Feed</div>
                <div style={description}>
                  Subscribe in Apple Calendar, Google Calendar, or Outlook. Stays up to date automatically.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={icalUrl} style={urlInput} />
                  <button onClick={() => copyToClipboard('ical')} style={copyBtn(copied === 'ical')}>
                    {copied === 'ical' ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
                <p style={helper}>
                  Apple Calendar: File → New Calendar Subscription → paste above.{' '}
                  Google Calendar: Other calendars → From URL → paste above.
                </p>
              </div>

              {/* Revoke */}
              <div>
                <button
                  onClick={revokeToken}
                  disabled={revoking}
                  onMouseEnter={(e) => {
                    if (!revoking) (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none'
                  }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: 13, fontWeight: 600,
                    fontFamily: font.sans,
                    color: revoking ? colors.textMuted : colors.red,
                    cursor: revoking ? 'not-allowed' : 'pointer',
                    textDecoration: 'none',
                    transition: `color ${transition.normal}`,
                  }}
                >
                  {revoking ? 'Revoking…' : 'Revoke link & generate new one'}
                </button>
              </div>

            </div>
          )}

          {msg && <p style={{ fontSize: 13, color: colors.red, marginTop: 10 }}>{msg}</p>}
        </div>
      )}

    </div>
  )
}
