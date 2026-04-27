'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

type Mode = 'signin' | 'signup' | 'magic' | 'forgot'

// ── Design tokens (inline — this page has no AppNav wrapper) ─────────────────
const t = {
  base:        '#1C1D2E',
  surface:     '#252638',
  card:        '#31344D',
  elevated:    '#3A3E5C',
  border:      'rgba(255,255,255,0.09)',
  borderStrong:'rgba(255,255,255,0.15)',
  violet:      '#7C3AED',
  violetHover: '#8B5CF6',
  blue:        '#295FFF',
  textPrimary: '#F0F2F8',
  textSecondary:'#9CA3AF',
  textMuted:   '#6B7280',
  green:       '#22C55E',
  red:         '#FC8181',
}

// ── Shared element styles ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: t.elevated,
  border: `1px solid ${t.borderStrong}`,
  borderRadius: 8,
  fontSize: 14,
  color: t.textPrimary,
  boxSizing: 'border-box',
  marginBottom: 12,
  outline: 'none',
  fontFamily: 'inherit',
}

const primaryBtn = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '11px 0',
  background: loading ? t.elevated : t.violet,
  color: loading ? t.textMuted : 'white',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: loading ? 'not-allowed' : 'pointer',
  marginBottom: 12,
  fontFamily: 'inherit',
  transition: 'background 0.14s',
})

const ghostBtn: React.CSSProperties = {
  width: '100%',
  padding: '11px 0',
  background: 'transparent',
  color: t.textPrimary,
  border: `1px solid ${t.borderStrong}`,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontFamily: 'inherit',
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  background: active ? t.violet : 'transparent',
  color: active ? 'white' : t.textMuted,
  border: `1px solid ${active ? t.violet : t.borderStrong}`,
  borderRadius: 6,
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.14s, color 0.14s',
})

const container: React.CSSProperties = {
  minHeight: '100vh',
  background: t.base,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const cardStyle: React.CSSProperties = {
  background: t.surface,
  border: `1px solid ${t.border}`,
  borderRadius: 12,
  padding: '32px',
  width: '100%',
  maxWidth: 420,
}

// ── Logo component — reused in both form states ───────────────────────────────
function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <img
        src="/logo.png"
        alt="ShowFlows"
        style={{ height: 30, width: 'auto', display: 'inline-block' }}
      />
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? searchParams.get('redirect') ?? '/'

  const [mode, setMode]       = useState<Mode>('signin')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = next
    })
  }, [next])

  const showMsg = (text: string, error = false) => { setMsg(text); setIsError(error) }

  const handleGoogle = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) { showMsg(error.message, true); setLoading(false) }
  }

  const handleEmailPassword = async () => {
    if (!email.trim())    return showMsg('Email is required.', true)
    if (!password.trim()) return showMsg('Password is required.', true)
    setLoading(true); setMsg('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { showMsg(error.message, true); setLoading(false) }
      else window.location.href = next
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          data: { full_name: name.trim() || undefined },
        },
      })
      if (error) { showMsg(error.message, true) }
      else showMsg('Check your email to confirm your account before signing in.')
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!email.trim()) return showMsg('Email is required.', true)
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) showMsg(error.message, true)
    else showMsg('Magic link sent — check your email to sign in.')
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) return showMsg('Enter your email address above.', true)
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) showMsg(error.message, true)
    else showMsg('Password reset email sent — check your inbox.')
    setLoading(false)
  }

  const titleText =
    mode === 'signin' ? 'Welcome back' :
    mode === 'signup' ? 'Create your account' :
    mode === 'magic'  ? 'Sign in with magic link' :
    'Reset your password'

  // ── Forgot password state ─────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div style={container}>
        <div style={cardStyle}>
          <Logo />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px', textAlign: 'center', color: t.textPrimary }}>
            Reset your password
          </h2>
          <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
            Enter your email and we'll send you a reset link.
          </p>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter') handleForgotPassword() }}
          />
          {msg && (
            <p style={{ fontSize: 13, color: isError ? t.red : t.green, marginBottom: 12, textAlign: 'center' }}>
              {msg}
            </p>
          )}
          <button onClick={handleForgotPassword} disabled={loading} style={primaryBtn(loading)}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <button
            onClick={() => { setMode('signin'); setMsg('') }}
            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: 13, color: t.blue, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    )
  }

  // ── Main sign in / sign up / magic link ───────────────────────────────────
  return (
    <div style={container}>
      <div style={cardStyle}>
        <Logo />

        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px', textAlign: 'center', color: t.textPrimary }}>
          {titleText}
        </h2>

        {/* Google OAuth */}
        <button onClick={handleGoogle} disabled={loading} style={ghostBtn}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, color: t.textMuted, fontSize: 13 }}>
          <div style={{ flex: 1, height: 1, background: t.border }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, background: t.border }} />
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button style={tabStyle(mode === 'signin')} onClick={() => { setMode('signin'); setMsg('') }}>Sign in</button>
          <button style={tabStyle(mode === 'signup')} onClick={() => { setMode('signup'); setMsg('') }}>Sign up</button>
          <button style={tabStyle(mode === 'magic')}  onClick={() => { setMode('magic');  setMsg('') }}>Magic link</button>
        </div>

        {/* Name — signup only */}
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="First and last name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        )}

        {/* Email */}
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') mode === 'magic' ? handleMagicLink() : handleEmailPassword()
          }}
        />

        {/* Password — not shown for magic link */}
        {mode !== 'magic' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEmailPassword() }}
          />
        )}

        {mode === 'signup' && (
          <p style={{ fontSize: 12, color: t.textMuted, marginTop: -8, marginBottom: 12 }}>
            At least 6 characters
          </p>
        )}

        {/* Forgot password link */}
        {mode === 'signin' && (
          <div style={{ textAlign: 'right', marginBottom: 12, marginTop: -4 }}>
            <button
              onClick={() => { setMode('forgot'); setMsg('') }}
              style={{ background: 'none', border: 'none', fontSize: 12, color: t.blue, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 13, color: isError ? t.red : t.green, marginBottom: 12, textAlign: 'center' }}>
            {msg}
          </p>
        )}

        <button
          onClick={mode === 'magic' ? handleMagicLink : handleEmailPassword}
          disabled={loading}
          style={primaryBtn(loading)}
        >
          {loading ? 'Please wait…' :
            mode === 'signin' ? 'Sign in' :
            mode === 'signup' ? 'Create account' :
            'Send magic link'}
        </button>

        <p style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
          By continuing you agree to ShowFlows'{' '}
          <a href="/terms" style={{ color: t.textMuted, textDecoration: 'underline' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: t.textMuted, textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#1C1D2E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif', color: '#6B7280', fontSize: 14,
      }}>
        Loading…
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
