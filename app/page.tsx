'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Projects from './components/Projects'
import type { ProjectsHandle } from './components/Projects'
import CalendarShare from './components/CalendarShare'
import AppNav from './components/AppNav'
import type { AdminSection, MemberSection, Project } from './components/AppNav'
import { colors, font } from './components/tokens'

export default function Home() {
  const [session, setSession]     = useState<any>(null)
  const [email, setEmail]         = useState('')
  const [message, setMessage]     = useState('')

  // Onboarding name prompt
  const [needsName, setNeedsName]   = useState(false)
  const [nameInput, setNameInput]   = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError]   = useState('')

  // Project state — lifted here so AppNav and Projects share it
  const [projects, setProjects]               = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [myRole, setMyRole]                   = useState<'owner'|'editor'|'member'|'readonly'|null>(null)

  // Nav state — lives here, passed into both AppNav and Projects
  const [viewMode, setViewMode]         = useState<'admin'|'member'>('admin')
  const [activeSection, setActiveSection] = useState<AdminSection|MemberSection>('shows')
  const [conflictCount, setConflictCount] = useState(0)

  // Ref to Projects so AppNav can trigger the create modal
  const projectsRef = useRef<ProjectsHandle>(null)

  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    const url  = new URL(window.location.href)
    const next = url.searchParams.get('next')
    if (!next || !next.startsWith('/')) return '/'
    return next
  }, [])

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      setSession(s)
      if (s) checkNeedsName(s)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) checkNeedsName(s)
    })
    return () => { listener.subscription.unsubscribe() }
  }, [])

  const checkNeedsName = (s: any) => {
    const full = s?.user?.user_metadata?.full_name
    setNeedsName(!full || !full.trim())
  }

  const userInitials = (() => {
    const full = session?.user?.user_metadata?.full_name?.trim()
    if (full) {
      return full.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    }
    const em = session?.user?.email ?? ''
    return em.slice(0, 2).toUpperCase()
  })()

  // ── Name save ───────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    setNameError('')
    const trimmed = nameInput.trim()
    if (!trimmed) return setNameError('Please enter your name.')
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    if (error) { setNameError(error.message); setSavingName(false) }
    else        { setNeedsName(false);         setSavingName(false) }
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setMessage('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (error) setMessage(error.message)
    else       setMessage('Check your email for the login link.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setProjects([])
    setSelectedProject(null)
    setMyRole(null)
    setViewMode('admin')
    setActiveSection('shows')
  }

  // ── Project switch — preserve viewMode across switches ──────────────────────
  const handleSelectProject = (p: Project | null) => {
    setSelectedProject(p)
    setActiveSection('shows')
    // viewMode intentionally NOT reset
  }

  // ── Conflict count — fetch when project changes ──────────────────────────────
  useEffect(() => {
    if (!selectedProject) { setConflictCount(0); return }
    fetch(`/api/projects/${selectedProject.id}/billing-status`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => setConflictCount(d.conflictCount ?? 0))
      .catch(() => setConflictCount(0))
  }, [selectedProject?.id])

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <main style={{
        minHeight: '100vh',
        background: colors.base,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.sans,
        padding: 24,
      }}>
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '32px 36px',
          width: '100%',
          maxWidth: 360,
        }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <img
              src="/logo.png"
              alt="ShowFlows"
              style={{ height: 32, width: 'auto', display: 'inline-block' }}
            />
          </div>

          <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>
            Sign in with your email
          </p>

          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: colors.card,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 8,
              color: colors.textPrimary,
              fontSize: 14,
              outline: 'none',
              marginBottom: 10,
            }}
          />
          <button
            onClick={handleLogin}
            style={{
              width: '100%',
              padding: '9px 0',
              background: colors.violet,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Send Magic Link
          </button>

          {message && (
            <p style={{ marginTop: 14, fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              {message}
            </p>
          )}

          <p style={{ marginTop: 16, fontSize: 12, color: colors.textDim, textAlign: 'center' }}>
            <a href="/login" style={{ color: colors.blue, textDecoration: 'none' }}>
              More sign-in options →
            </a>
          </p>
        </div>
      </main>
    )
  }

  // ── Name prompt ──────────────────────────────────────────────────────────────
  if (needsName) {
    return (
      <main style={{
        minHeight: '100vh',
        background: colors.base,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.sans,
        padding: 24,
      }}>
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '32px 36px',
          width: '100%',
          maxWidth: 360,
        }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <img
              src="/logo.png"
              alt="ShowFlows"
              style={{ height: 32, width: 'auto', display: 'inline-block' }}
            />
          </div>

          <p style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary, marginBottom: 6 }}>
            What's your name?
          </p>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>
            This is how you'll appear in invite emails and the app.
          </p>

          <input
            type="text"
            placeholder="Your full name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: colors.card,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 8,
              color: colors.textPrimary,
              fontSize: 14,
              outline: 'none',
              marginBottom: 10,
            }}
          />
          {nameError && (
            <p style={{ fontSize: 12, color: colors.red, marginBottom: 8 }}>{nameError}</p>
          )}
          <button
            onClick={handleSaveName}
            disabled={savingName}
            style={{
              width: '100%',
              padding: '9px 0',
              background: savingName ? colors.textMuted : colors.violet,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: savingName ? 'not-allowed' : 'pointer',
              marginBottom: 10,
            }}
          >
            {savingName ? 'Saving…' : 'Continue'}
          </button>
          <button
            onClick={() => setNeedsName(false)}
            style={{
              width: '100%',
              padding: '8px 0',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        </div>
      </main>
    )
  }

  // ── Main app ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: colors.base, fontFamily: font.sans }}>

      <AppNav
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        myRole={myRole}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        userInitials={userInitials}
        conflictCount={conflictCount}
        onLogout={handleLogout}
        onCreateProject={() => projectsRef.current?.openCreateModal()}
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
        <Projects
          ref={projectsRef}
          projects={projects}
          setProjects={setProjects}
          selectedProject={selectedProject}
          onSelectProject={handleSelectProject}
          myRole={myRole}
          setMyRole={setMyRole}
          viewMode={viewMode}
          activeSection={activeSection}
          onNavigate={setActiveSection}
        />
        <CalendarShare />
      </div>

    </div>
  )
}
