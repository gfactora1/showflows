'use client'

import { useState, useEffect } from 'react'
import ProjectMembers from './ProjectMembers'
import Shows from './Shows'
import People from './People'
import Roles from './Roles'
import Providers from './Providers'
import DefaultRoster from './DefaultRoster'
import Venues from './Venues'
import AvailabilityCalendar from './AvailabilityCalendar'
import MemberShowsView from './MemberShowsView'
import SongLibrary from './SongLibrary'
import MemberAvailability from './MemberAvailability'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Tab = 'shows' | 'venues' | 'roster' | 'people' | 'roles' | 'providers' | 'songs' | 'availability' | 'conflicts' | 'members'

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'shows', label: 'Shows' },
  { key: 'venues', label: 'Venues' },
  { key: 'roster', label: 'Default Roster' },
  { key: 'people', label: 'People' },
  { key: 'roles', label: 'Roles' },
  { key: 'providers', label: 'Providers' },
  { key: 'songs', label: '🎵 Songs' },
  { key: 'availability', label: '📅 Availability' },
  { key: 'conflicts', label: '⚡ Conflicts' },
  { key: 'members', label: 'Members' },
]

const MEMBER_TABS: { key: Tab; label: string }[] = [
  { key: 'shows', label: 'Shows' },
  { key: 'availability', label: '📅 Availability' },
]

type Props = {
  project: Project
  myRole: Role | null
}

export default function ProjectDetail({ project, myRole }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('shows')
  const [upgrading, setUpgrading] = useState(false)
  const [managingBilling, setManagingBilling] = useState(false)
  const [isPro, setIsPro] = useState<boolean | null>(null)


  // canToggle: owners/editors can switch views manually
  const canToggle = myRole === 'owner' || myRole === 'editor'
  const isMemberOnly = myRole === 'member' || myRole === 'readonly'

  // adminToggle: only meaningful for owners/editors who clicked the toggle button
  const [adminToggle, setAdminToggle] = useState(false)

  // Reset admin toggle when switching projects
  useEffect(() => { setAdminToggle(false) }, [project.id])

  // memberView is derived, not stored — no render lag possible
  const memberView = isMemberOnly || adminToggle

  const effectiveRole: Role | null = memberView ? 'member' : myRole

  useEffect(() => {
    if (memberView && activeTab !== 'shows' && activeTab !== 'availability') {
      setActiveTab('shows')
    }
  }, [memberView, activeTab])

  const TABS = memberView ? MEMBER_TABS : ADMIN_TABS

  useEffect(() => {
    const fetchBilling = async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/billing-status`, { credentials: 'include' })
        if (res.ok) { const data = await res.json(); setIsPro(data.isPro ?? false) }
        else setIsPro(false)
      } catch { setIsPro(false) }
    }
    fetchBilling()
  }, [project.id])

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else { alert(data.error ?? 'Something went wrong'); setUpgrading(false) }
    } catch { alert('Something went wrong. Please try again.'); setUpgrading(false) }
  }

  const handleManageBilling = async () => {
    setManagingBilling(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else { alert(data.error ?? 'Something went wrong'); setManagingBilling(false) }
    } catch { alert('Something went wrong. Please try again.'); setManagingBilling(false) }
  }

  // Don't render anything until we know the user's role — prevents admin tab flash for members
  if (myRole === null) return null

  return (
    <div>
      {/* View toggle — owners and editors only */}
      {canToggle && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => setAdminToggle((v) => !v)}
            style={{ padding: '5px 14px', background: memberView ? '#f0f0f0' : 'none', border: '1px solid #ddd', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {memberView ? '⚙️ Switch to admin view' : '👤 Switch to member view'}
          </button>
        </div>
      )}

      {/* Member view banner — only shown to owners/editors who toggled, not to actual members */}
      {memberView && canToggle && (
        <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#888' }}>
          👤 Member view — you're seeing this project as a member would
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #ddd', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{ padding: '8px 16px', border: 'none', borderBottom: isActive ? '2px solid #333' : '2px solid transparent', marginBottom: -2, background: 'none', cursor: 'pointer', fontWeight: isActive ? 600 : 400, fontSize: 14, color: isActive ? '#111' : '#666' }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Member view content */}
      {memberView && activeTab === 'shows' && <MemberShowsView projectId={project.id} />}
      {memberView && activeTab === 'availability' && <MemberAvailability projectId={project.id} />}

      {/* Admin view content */}
      {!memberView && activeTab === 'members' && <ProjectMembers project={project} />}
      {!memberView && activeTab === 'shows' && <Shows projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'people' && <People projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'roles' && <Roles projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'providers' && <Providers projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'roster' && <DefaultRoster projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'venues' && <Venues projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'songs' && <SongLibrary projectId={project.id} myRole={effectiveRole} />}
      {!memberView && activeTab === 'availability' && <AvailabilityCalendar projectId={project.id} />}

      {!memberView && activeTab === 'conflicts' && (
        <section>
          <h3 style={{ marginTop: 0 }}>Conflict Intelligence</h3>
          <p style={{ opacity: 0.75, maxWidth: 520, marginBottom: 20 }}>
            {isPro ? 'Pro is active — conflict detection is running for your upcoming shows.' : 'Pro feature — detects scheduling conflicts, missing required roles, and missing sound providers across your upcoming shows.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={`/projects/${project.id}/conflicts`} style={{ display: 'inline-block', padding: '10px 20px', background: '#111', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
              Open Conflict Intelligence →
            </a>
            {myRole === 'owner' && isPro === false && (
              <button onClick={handleUpgrade} disabled={upgrading} style={{ padding: '10px 20px', background: upgrading ? '#999' : '#6c47ff', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: upgrading ? 'not-allowed' : 'pointer' }}>
                {upgrading ? 'Redirecting...' : '⚡ Upgrade to Pro'}
              </button>
            )}
            {myRole === 'owner' && isPro === true && (
              <button onClick={handleManageBilling} disabled={managingBilling} style={{ padding: '10px 20px', background: managingBilling ? '#999' : '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: managingBilling ? 'not-allowed' : 'pointer' }}>
                {managingBilling ? 'Redirecting...' : 'Manage Subscription'}
              </button>
            )}
          </div>
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.6 }}>Opens in full view. Use your browser back button to return here.</p>
        </section>
      )}
    </div>
  )
}
