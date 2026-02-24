'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

export default function InvitePage() {
  const params = useParams()

  // params.token can be string | string[] | undefined depending on Next version/settings
  const token = useMemo(() => {
    const t = (params as any)?.token
    if (Array.isArray(t)) return t[0] ?? ''
    return typeof t === 'string' ? t : ''
  }, [params])

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const acceptInvite = async () => {
    setMsg('')
    if (!token) {
      setMsg('Missing token in URL.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const json = await res.json()

      if (!res.ok) {
        setMsg(`Accept failed (${res.status}). ${JSON.stringify(json)}`)
      } else {
        setMsg('✅ Invite accepted! You can close this tab and go back to ShowFlows.')
      }
    } catch (e: any) {
      setMsg(`Accept failed: ${e?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>ShowFlows</h1>
      <h2>Project Invitation</h2>

      <p>
        <strong>Token:</strong> {token || '(missing)'}
      </p>

      <button onClick={acceptInvite} disabled={loading || !token}>
        {loading ? 'Accepting...' : 'Accept Invite'}
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  )
}