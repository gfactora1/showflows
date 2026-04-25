'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function CalendarShare() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState<'web' | 'ical' | null>(null)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const webUrl = token ? `${baseUrl}/cal/${token}` : ''
  const icalUrl = token ? `${baseUrl}/api/cal/${token}/ical` : ''

  useEffect(() => {
    loadToken()
  }, [])

  const loadToken = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('calendar_shares')
      .select('id')
      .eq('auth_user_id', user.id)
      .eq('revoked', false)
      .maybeSingle()

    setToken(data?.id ?? null)
    setLoading(false)
  }

  const generateToken = async () => {
    setGenerating(true)
    setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('calendar_shares')
      .insert({ auth_user_id: user.id })
      .select('id')
      .single()

    if (error) {
      setMsg('Error generating link. Try again.')
    } else {
      setToken(data.id)
    }
    setGenerating(false)
  }

  const revokeToken = async () => {
    if (!token) return
    if (!confirm('This will permanently break your current shareable link. Anyone using it will lose access. Generate a new one to reshare.\n\nContinue?')) return

    setRevoking(true)
    setMsg('')

    const { error } = await supabase
      .from('calendar_shares')
      .update({ revoked: true })
      .eq('id', token)

    if (error) {
      setMsg('Error revoking link. Try again.')
    } else {
      setToken(null)
    }
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

  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid #eee' }}>

      {/* Clickable header row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: expanded ? 4 : 0,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          📅 My Shareable Calendar
        </h2>
        <span style={{ fontSize: 16, color: '#999', lineHeight: 1 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {!expanded && (
        <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
          {token ? 'Your shareable link is active.' : 'Share your schedule with anyone — no login required.'}
        </p>
      )}

      {/* Collapsible content */}
      {expanded && (
        <>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 20, marginTop: 8 }}>
            Share your show schedule with anyone — no login required. Great for keeping family and friends in the loop.
          </p>

          {!token ? (
            <div>
              <button
                onClick={generateToken}
                disabled={generating}
                style={{
                  padding: '10px 20px',
                  background: generating ? '#999' : '#111',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? 'Generating…' : 'Generate shareable link'}
              </button>
              <p style={{ fontSize: 13, color: '#999', marginTop: 10 }}>
                Creates a private link only you can share. Revoke it anytime to cut off access.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>

              {/* Web calendar link */}
              <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fafafa' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
                  Web Calendar
                </div>
                <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
                  A beautiful calendar page anyone can open in their browser.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly
                    value={webUrl}
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, color: '#555', background: 'white', fontFamily: 'monospace' }}
                  />
                  <button
                    onClick={() => copyToClipboard('web')}
                    style={{ padding: '7px 14px', background: copied === 'web' ? '#1a7a3a' : '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
                  >
                    {copied === 'web' ? '✓ Copied' : 'Copy link'}
                  </button>
                  <a
                    href={webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '7px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Preview
                  </a>
                </div>
              </div>

              {/* iCal feed link */}
              <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fafafa' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
                  iCal Feed
                </div>
                <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
                  Subscribe in Apple Calendar, Google Calendar, or Outlook. Stays up to date automatically.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly
                    value={icalUrl}
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, color: '#555', background: 'white', fontFamily: 'monospace' }}
                  />
                  <button
                    onClick={() => copyToClipboard('ical')}
                    style={{ padding: '7px 14px', background: copied === 'ical' ? '#1a7a3a' : '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
                  >
                    {copied === 'ical' ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#999', marginTop: 8, marginBottom: 0 }}>
                  In Apple Calendar: File → New Calendar Subscription → paste the link above.
                  In Google Calendar: Other calendars → From URL → paste the link above.
                </p>
              </div>

              {/* Revoke */}
              <div>
                <button
                  onClick={revokeToken}
                  disabled={revoking}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: revoking ? '#bbb' : '#c00', cursor: revoking ? 'not-allowed' : 'pointer', padding: 0 }}
                >
                  {revoking ? 'Revoking…' : 'Revoke link & generate new one'}
                </button>
              </div>
            </div>
          )}

          {msg && <p style={{ fontSize: 13, color: '#c00', marginTop: 8 }}>{msg}</p>}
        </>
      )}
    </div>
  )
}
