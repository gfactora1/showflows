'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }
  | { kind: 'invalid' }

export default function ResetPasswordPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setState({ kind: 'ready' })
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setState({ kind: 'ready' })
      } else {
        setTimeout(() => {
          setState((prev) => {
            if (prev.kind === 'loading') return { kind: 'invalid' }
            return prev
          })
        }, 3000)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async () => {
    setMsg('')
    setIsError(false)

    if (!password) { setMsg('Password is required.'); setIsError(true); return }
    if (password.length < 6) { setMsg('Password must be at least 6 characters.'); setIsError(true); return }
    if (password !== confirm) { setMsg('Passwords do not match.'); setIsError(true); return }

    setState({ kind: 'saving' })

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setState({ kind: 'ready' })
      setMsg(error.message)
      setIsError(true)
    } else {
      setState({ kind: 'success' })
    }
  }

  const container: React.CSSProperties = {
    maxWidth: 420, margin: '80px auto', padding: '0 24px', fontFamily: 'sans-serif',
  }
  const logo: React.CSSProperties = {
    fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginBottom: 32, display: 'block', textAlign: 'center',
  }
  const card: React.CSSProperties = {
    border: '1px solid #e5e5e5', borderRadius: 12, padding: 32, background: 'white',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8,
    fontSize: 14, boxSizing: 'border-box', marginBottom: 12,
  }
  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '11px 0', background: '#111', color: 'white', border: 'none',
    borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
  }

  if (state.kind === 'loading') {
    return (
      <div style={container}>
        <span style={logo}>ShowFlows</span>
        <div style={card}>
          <p style={{ color: '#888', textAlign: 'center' }}>Verifying reset link…</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <div style={container}>
        <span style={logo}>ShowFlows</span>
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16, textAlign: 'center' }}>🔗</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', textAlign: 'center' }}>
            Invalid or expired link
          </h2>
          <p style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
            This password reset link is no longer valid. Please request a new one.
          </p>
          <a href="/login" style={{ ...primaryBtn, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  if (state.kind === 'success') {
    return (
      <div style={container}>
        <span style={logo}>ShowFlows</span>
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 16, textAlign: 'center' }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', textAlign: 'center' }}>
            Password updated
          </h2>
          <p style={{ color: '#555', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
            Your password has been changed successfully.
          </p>
          <a href="/" style={{ ...primaryBtn, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Go to your projects →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={container}>
      <span style={logo}>ShowFlows</span>
      <div style={card}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
          Set a new password
        </h2>
        <p style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          Choose a strong password for your account.
        </p>

        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          onKeyDown={(e) => { if (e.key === 'Enter') handleReset() }}
        />

        <p style={{ fontSize: 12, color: '#aaa', marginTop: -8, marginBottom: 12 }}>
           At least 6 characters
        </p>

        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
          onKeyDown={(e) => { if (e.key === 'Enter') handleReset() }}
        />

        {msg && (
          <p style={{ fontSize: 13, color: isError ? '#c00' : '#1a7a3a', marginBottom: 12, textAlign: 'center' }}>
            {msg}
          </p>
        )}

        <button
          onClick={handleReset}
          disabled={state.kind === 'saving'}
          style={{
            ...primaryBtn,
            background: state.kind === 'saving' ? '#999' : '#111',
            cursor: state.kind === 'saving' ? 'not-allowed' : 'pointer',
          }}
        >
          {state.kind === 'saving' ? 'Saving…' : 'Update password'}
        </button>

        <a href="/login" style={{ display: 'block', textAlign: 'center', fontSize: 13, color: '#888', textDecoration: 'none', marginTop: 8 }}>
          Back to sign in
        </a>
      </div>
    </div>
  )
}
