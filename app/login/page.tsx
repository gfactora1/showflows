'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

type Mode = 'signin' | 'signup' | 'magic' | 'forgot'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? searchParams.get('redirect') ?? '/'

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.href = next
      }
    })
  }, [next])

  const showMsg = (text: string, error = false) => {
    setMsg(text)
    setIsError(error)
  }

  const handleGoogle = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      showMsg(error.message, true)
      setLoading(false)
    }
  }

  const handleEmailPassword = async () => {
    if (!email.trim()) return showMsg('Email is required.', true)
    if (!password.trim()) return showMsg('Password is required.', true)

    setLoading(true)
    setMsg('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        showMsg(error.message, true)
        setLoading(false)
      } else {
        window.location.href = next
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          data: {
            full_name: name.trim() || undefined,
          },
        },
      })
      if (error) {
        showMsg(error.message, true)
        setLoading(false)
      } else {
        showMsg('Check your email to confirm your account before signing in.')
        setLoading(false)
      }
    }
  }

  const handleMagicLink = async () => {
    if (!email.trim()) return showMsg('Email is required.', true)

    setLoading(true)
    setMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      showMsg(error.message, true)
    } else {
      showMsg('Magic link sent — check your email to sign in.')
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) return showMsg('Enter your email address above.', true)

    setLoading(true)
    setMsg('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      showMsg(error.message, true)
    } else {
      showMsg('Password reset email sent — check your inbox.')
    }
    setLoading(false)
  }

  const container: React.CSSProperties = {
    maxWidth: 420,
    margin: '80px auto',
    padding: '0 24px',
    fontFamily: 'sans-serif',
  }
  const logo: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.5,
    marginBottom: 32,
    display: 'block',
    textAlign: 'center',
  }
  const card: React.CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: 12,
    padding: 32,
    background: 'white',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    marginBottom: 12,
  }
  const primaryBtn: React.CSSProperties = {
    width: '100%',
    padding: '11px 0',
    background: loading ? '#999' : '#111',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    marginBottom: 12,
  }
  const googleBtn: React.CSSProperties = {
    width: '100%',
    padding: '11px 0',
    background: 'white',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
  const divider: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    color: '#aaa',
    fontSize: 13,
  }
  const dividerLine: React.CSSProperties = {
    flex: 1, height: 1, background: '#eee',
  }
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    background: active ? '#111' : 'none',
    color: active ? 'white' : '#666',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  })

  const title = mode === 'signin' ? 'Sign in to ShowFlows' :
    mode === 'signup' ? 'Create your account' :
    mode === 'magic' ? 'Sign in with magic link' :
    'Reset your password'

  // Forgot password mode
  if (mode === 'forgot') {
    return (
      <div style={container}>
        <span style={logo}>ShowFlows</span>
        <div style={card}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
            Reset your password
          </h2>
          <p style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
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
            <p style={{ fontSize: 13, color: isError ? '#c00' : '#1a7a3a', marginBottom: 12, textAlign: 'center' }}>
              {msg}
            </p>
          )}
          <button onClick={handleForgotPassword} disabled={loading} style={primaryBtn}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <button
            onClick={() => { setMode('signin'); setMsg('') }}
            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: 13, color: '#888', cursor: 'pointer' }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={container}>
      <span style={logo}>ShowFlows</span>
      <div style={card}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px', textAlign: 'center' }}>
          {title}
        </h2>

        {/* Google OAuth */}
        <button onClick={handleGoogle} disabled={loading} style={googleBtn}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Continue with Google
        </button>

        <div style={divider}>
          <div style={dividerLine} />
          <span>or</span>
          <div style={dividerLine} />
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button style={tabStyle(mode === 'signin')} onClick={() => { setMode('signin'); setMsg('') }}>
            Sign in
          </button>
          <button style={tabStyle(mode === 'signup')} onClick={() => { setMode('signup'); setMsg('') }}>
            Sign up
          </button>
          <button style={tabStyle(mode === 'magic')} onClick={() => { setMode('magic'); setMsg('') }}>
            Magic link
          </button>
        </div>

        {/* Name field — signup only */}
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="First and last name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        )}

        {/* Email field */}
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

        {/* Password field — not shown for magic link */}
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

        {/* Password hint for signup */}
        {mode === 'signup' && (
          <p style={{ fontSize: 12, color: '#aaa', marginTop: -8, marginBottom: 12 }}>
            At least 6 characters
          </p>
        )}

        {/* Forgot password link — sign in mode only */}
        {mode === 'signin' && (
          <div style={{ textAlign: 'right', marginBottom: 12, marginTop: -4 }}>
            <button
              onClick={() => { setMode('forgot'); setMsg('') }}
              style={{ background: 'none', border: 'none', fontSize: 12, color: '#888', cursor: 'pointer', padding: 0 }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 13, color: isError ? '#c00' : '#1a7a3a', marginBottom: 12, textAlign: 'center' }}>
            {msg}
          </p>
        )}

        <button
          onClick={mode === 'magic' ? handleMagicLink : handleEmailPassword}
          disabled={loading}
          style={primaryBtn}
        >
          {loading ? 'Please wait…' :
            mode === 'signin' ? 'Sign in' :
            mode === 'signup' ? 'Create account' :
            'Send magic link'}
        </button>

        <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', margin: 0 }}>
          By continuing you agree to ShowFlows'{' '}
          <a href="/terms" style={{ color: '#aaa' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: '#aaa' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Loading…</div>
    }>
      <LoginForm />
    </Suspense>
  )
}
