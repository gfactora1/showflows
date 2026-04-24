'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Projects from './components/Projects'
import CalendarShare from './components/CalendarShare'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  // Onboarding state
  const [needsName, setNeedsName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    const url = new URL(window.location.href)
    const next = url.searchParams.get('next')
    if (!next || !next.startsWith('/')) return '/'
    return next
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      setSession(s)
      if (s) checkNeedsName(s)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkNeedsName(session)
    })

    return () => { listener.subscription.unsubscribe() }
  }, [])

  const checkNeedsName = (session: any) => {
    const fullName = session?.user?.user_metadata?.full_name
    setNeedsName(!fullName || !fullName.trim())
  }

  const handleSaveName = async () => {
    setNameError('')
    const trimmed = nameInput.trim()
    if (!trimmed) return setNameError('Please enter your name.')
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    if (error) { setNameError(error.message); setSavingName(false) }
    else { setNeedsName(false); setSavingName(false) }
  }

  const handleLogin = async () => {
    setMessage('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    if (error) setMessage(error.message)
    else setMessage('Check your email for the login link.')
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  if (!session) {
    return (
      <main style={{ padding: 24 }}>
        <h1>ShowFlows</h1>
        <p>Login with email</p>
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, marginRight: 8 }}
        />
        <button onClick={handleLogin}>Send Magic Link</button>
        {message && <p>{message}</p>}
      </main>
    )
  }

  if (needsName) {
    return (
      <main style={{ padding: 24, maxWidth: 420, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 32, background: 'white' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
            Welcome to ShowFlows!
          </h2>
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
            What's your name? This helps your bandmates and collaborators recognize you.
          </p>
          <input
            type="text"
            placeholder="First and last name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName() }}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
            autoFocus
          />
          {nameError && <p style={{ fontSize: 13, color: '#c00', marginBottom: 12, textAlign: 'center' }}>{nameError}</p>}
          <button
            onClick={handleSaveName}
            disabled={savingName}
            style={{ width: '100%', padding: '11px 0', background: savingName ? '#999' : '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: savingName ? 'not-allowed' : 'pointer', marginBottom: 12 }}
          >
            {savingName ? 'Saving…' : 'Continue'}
          </button>
          <button
            onClick={() => setNeedsName(false)}
            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: 13, color: '#bbb', cursor: 'pointer', padding: 0 }}
          >
            Skip for now
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>ShowFlows</h1>
      <p>Logged in as {session.user.email}</p>
      <button onClick={handleLogout}>Logout</button>
      <Projects />
      <CalendarShare />
    </main>
  )
}
