'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type InviteData = {
  id: string
  project_id: string
  project_name: string | null
  invited_email: string
  role: string
  expires_at: string
  accepted_at: string | null
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'expired' }
  | { kind: 'already_accepted' }
  | { kind: 'needs_login'; invite: InviteData }
  | { kind: 'ready'; invite: InviteData; userEmail: string }
  | { kind: 'wrong_email'; invite: InviteData; userEmail: string }
  | { kind: 'accepting' }
  | { kind: 'accepted'; projectId: string; projectName: string }
  | { kind: 'error'; message: string }

function roleLabel(role: string) {
  switch (role) {
    case 'editor': return 'Editor'
    case 'member': return 'Member'
    case 'readonly': return 'View only'
    default: return role
  }
}

export default function AcceptInviteClient({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ kind: 'loading' })

  useEffect(() => {
    const init = async () => {
      // 1. Look up the invite
      const res = await fetch('/api/invites/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        setState({ kind: 'invalid', message: data.error ?? 'This invite link is not valid.' })
        return
      }

      const invite: InviteData = data.data

      // 2. Check if already accepted
      if (invite.accepted_at) {
        setState({ kind: 'already_accepted' })
        return
      }

      // 3. Check if expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        setState({ kind: 'expired' })
        return
      }

      // 4. Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (!user || !user.email) {
        setState({ kind: 'needs_login', invite })
        return
      }

      const userEmail = user.email.trim().toLowerCase()
      const invitedEmail = invite.invited_email.trim().toLowerCase()

      // 5. Check if logged in as the right email
      if (userEmail !== invitedEmail) {
        setState({ kind: 'wrong_email', invite, userEmail })
        return
      }

      setState({ kind: 'ready', invite, userEmail })
    }

    init()
  }, [token])

  const acceptInvite = async (invite: InviteData) => {
    setState({ kind: 'accepting' })

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.ok) {
      setState({ kind: 'error', message: data.error ?? 'Something went wrong accepting the invite.' })
      return
    }

    setState({
      kind: 'accepted',
      projectId: invite.project_id,
      projectName: invite.project_name ?? 'your project',
    })
  }

  // Styles
  const container: React.CSSProperties = {
    maxWidth: 460,
    margin: '80px auto',
    padding: '0 24px',
    textAlign: 'center',
    fontFamily: 'sans-serif',
  }

  const logo: React.CSSProperties = {
    marginBottom: 32,
    display: 'block',
    textAlign: 'center' as const,
  }

  // Reusable logo element — image with text fallback
  const LogoEl = (
    <div style={logo}>
      <img
        src="/logo.png"
        alt="ShowFlows"
        style={{ height: 30, width: 'auto', display: 'inline-block' }}
      />
    </div>
  )

  const card: React.CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: 12,
    padding: 32,
    background: 'white',
  }

  const primaryBtn: React.CSSProperties = {
    display: 'inline-block',
    padding: '12px 28px',
    background: '#111',
    color: 'white',
    borderRadius: 8,
    border: 'none',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    marginTop: 20,
  }

  const secondaryBtn: React.CSSProperties = {
    display: 'inline-block',
    padding: '10px 20px',
    background: 'none',
    color: '#111',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
    marginTop: 12,
  }

  if (state.kind === 'loading') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <p style={{ color: '#888' }}>Loading your invite…</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Invalid invite link</h2>
          <p style={{ color: '#666', fontSize: 14 }}>{state.message}</p>
          <a href="/" style={secondaryBtn}>Go to ShowFlows</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'expired') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏰</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Invite has expired</h2>
          <p style={{ color: '#666', fontSize: 14 }}>
            This invite link is no longer valid. Ask the project owner to send a new one.
          </p>
          <a href="/" style={secondaryBtn}>Go to ShowFlows</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'already_accepted') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Already accepted</h2>
          <p style={{ color: '#666', fontSize: 14 }}>
            This invite has already been used. You should already be a member of the project.
          </p>
          <a href="/" style={primaryBtn}>Go to your projects</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'needs_login') {
    const { invite } = state
    const loginUrl = `/login?redirect=/invite/${token}`
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👋</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>You've been invited</h2>
          <p style={{ color: '#555', fontSize: 15, margin: '0 0 8px' }}>
            Join <strong>{invite.project_name ?? 'a project'}</strong> as a{' '}
            <strong>{roleLabel(invite.role)}</strong>.
          </p>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>
            Sign in as <strong>{invite.invited_email}</strong> to accept this invite.
          </p>
          <a href={loginUrl} style={primaryBtn}>Sign in to accept →</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'wrong_email') {
    const { invite, userEmail } = state
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Wrong account</h2>
          <p style={{ color: '#555', fontSize: 14, margin: '0 0 8px' }}>
            This invite was sent to <strong>{invite.invited_email}</strong>, but you're signed in as{' '}
            <strong>{userEmail}</strong>.
          </p>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>
            Please sign out and sign in with the correct email to accept this invite.
          </p>
          <a href="/" style={secondaryBtn}>Go to ShowFlows</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'ready') {
    const { invite } = state
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎵</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>You've been invited</h2>
          <p style={{ color: '#555', fontSize: 15, margin: '0 0 4px' }}>
            Join <strong>{invite.project_name ?? 'a project'}</strong>
          </p>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 24px' }}>
            Your role: <strong>{roleLabel(invite.role)}</strong>
          </p>
          <button
            onClick={() => acceptInvite(invite)}
            style={primaryBtn}
          >
            Accept Invitation →
          </button>
        </div>
      </div>
    )
  }

  if (state.kind === 'accepting') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <p style={{ color: '#888' }}>Accepting invite…</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'accepted') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>You're in!</h2>
          <p style={{ color: '#555', fontSize: 15, margin: '0 0 24px' }}>
            You've joined <strong>{state.projectName}</strong>.
          </p>
          <a href="/" style={primaryBtn}>Go to your projects →</a>
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div style={container}>
        {LogoEl}
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Something went wrong</h2>
          <p style={{ color: '#666', fontSize: 14 }}>{state.message}</p>
          <a href="/" style={secondaryBtn}>Go to ShowFlows</a>
        </div>
      </div>
    )
  }

  return null
}
