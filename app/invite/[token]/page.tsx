'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type InviteInfo = {
  id: string
  project_id: string
  invited_email: string
  role: 'editor' | 'member' | 'readonly'
  is_managed: boolean
  expires_at: string
  accepted_at: string | null
  project_name?: string | null
}

type Status = 'idle' | 'loading' | 'ready' | 'accepting' | 'success' | 'error'

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()

  const token = useMemo(() => {
    const t = (params as any)?.token
    if (Array.isArray(t)) return t[0] ?? ''
    return typeof t === 'string' ? t : ''
  }, [params])

  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg] = useState('')
  const [invite, setInvite] = useState<InviteInfo | null>(null)

  const loadInvite = async () => {
    setMsg('')
    if (!token) {
      setInvite(null)
      setStatus('error')
      setMsg('Missing invite token in the URL.')
      return
    }

    setStatus('loading')
    try {
      const res = await fetch('/api/invites/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setInvite(null)
        setStatus('error')
        setMsg(json?.error ? String(json.error) : `Could not load invite (${res.status}).`)
        return
      }

      const inv = (json?.data ?? null) as InviteInfo | null
      if (!inv) {
        setInvite(null)
        setStatus('error')
        setMsg('Invite not found.')
        return
      }

      setInvite(inv)

      // Already accepted
      if (inv.accepted_at) {
        setStatus('success')
        setMsg('Invite already accepted. You can return to ShowFlows.')
        return
      }

      // Expired
      if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
        setStatus('error')
        setMsg('This invite has expired. Ask the project admin to send a new one.')
        return
      }

      setStatus('ready')
    } catch (e: any) {
      setInvite(null)
      setStatus('error')
      setMsg(`Could not load invite: ${e?.message ?? String(e)}`)
    }
  }

  const acceptInvite = async () => {
    setMsg('')
    if (!token) {
      setStatus('error')
      setMsg('Missing invite token in the URL.')
      return
    }

    // Only allow accepting when we’re actually ready
    if (status !== 'ready') return

    setStatus('accepting')
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatus('error')
        setMsg(json?.error ? String(json.error) : `Accept failed (${res.status}).`)
        return
      }

      setStatus('success')
      setMsg('✅ Invite accepted! Redirecting you back to ShowFlows…')

      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 900)
    } catch (e: any) {
      setStatus('error')
      setMsg(`Accept failed: ${e?.message ?? String(e)}`)
    }
  }

  useEffect(() => {
    loadInvite()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const title = invite?.project_name
    ? `You’re invited to join ${invite.project_name}`
    : 'You’re invited to join a project'

  const canAccept = !!token && status === 'ready'

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 6 }}>ShowFlows</h1>
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      {!token && (
        <p style={{ marginTop: 12 }}>
          This invite link is missing its token. Ask the project admin to resend the invite.
        </p>
      )}

      {status === 'loading' && <p style={{ marginTop: 12 }}>Loading invite…</p>}

      {invite && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'grid', rowGap: 6 }}>
            {invite.project_name && (
              <div>
                <b>Project:</b> {invite.project_name}
              </div>
            )}
            <div>
              <b>Invited email:</b> {invite.invited_email}
            </div>
            <div>
              <b>Role:</b> {invite.role}
            </div>
            <div>
              <b>Expires:</b>{' '}
              {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={acceptInvite} disabled={!canAccept}>
          {status === 'accepting' ? 'Accepting…' : 'Accept invite'}
        </button>

        <button onClick={() => router.push('/')} style={{ opacity: 0.9 }}>
          Back to ShowFlows
        </button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <details style={{ marginTop: 16, opacity: 0.85 }}>
        <summary>Debug info</summary>
        <p style={{ marginTop: 8 }}>
          <b>Token:</b> {token || '(missing)'}
        </p>
      </details>
    </main>
  )
}