'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Projects from './components/Projects'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  // Read ?next=... from the URL (client-side)
  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    const url = new URL(window.location.href)
    const next = url.searchParams.get('next')
    // Basic safety: must be a relative path
    if (!next || !next.startsWith('/')) return '/'
    return next
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async () => {
    setMessage('')

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for the login link.')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

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

  return (
    <main style={{ padding: 24 }}>
      <h1>ShowFlows</h1>
      <p>Logged in as {session.user.email}</p>
      <button onClick={handleLogout}>Logout</button>

      <Projects />
    </main>
  )
}