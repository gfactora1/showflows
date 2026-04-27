'use client'

import { useState } from 'react'
import ProjectMembers from './ProjectMembers'
import Shows from './Shows'
import People from './People'
import Roles from './Roles'
import Providers from './Providers'
import DefaultRoster from './DefaultRoster'
import Venues from './Venues'
import { colors, radius, font } from './tokens'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Tab = 'shows' | 'venues' | 'roster' | 'people' | 'roles' | 'providers' | 'members' | 'conflicts'

const TABS: { key: Tab; label: string }[] = [
  { key: 'shows', label: 'Shows' },
  { key: 'venues', label: 'Venues' },
  { key: 'roster', label: 'Default Roster' },
  { key: 'people', label: 'People' },
  { key: 'roles', label: 'Roles' },
  { key: 'providers', label: 'Providers' },
  { key: 'conflicts', label: '⚡ Conflicts' },
  { key: 'members', label: 'Members' },
]

type Props = {
  project: Project
  myRole: Role | null
}

export default function ProjectDetail({ project, myRole }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('shows')
  const [upgrading, setUpgrading] = useState(false)

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? 'Something went wrong')
        setUpgrading(false)
      }
    } catch {
      alert('Something went wrong. Please try again.')
      setUpgrading(false)
    }
  }

  return (
    <div style={{ fontFamily: font.sans }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderBottom: isActive
                  ? `2px solid ${colors.violet}`
                  : '2px solid transparent',
                marginBottom: -1,
                background: isActive ? colors.violetSoft2 : 'transparent',
                borderRadius: `${radius.sm} ${radius.sm} 0 0`,
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                fontFamily: font.sans,
                color: isActive ? colors.textPrimary : colors.textMuted,
                transition: 'color 0.12s ease, background 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = colors.textSecondary
                  e.currentTarget.style.background = colors.violetSoft
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = colors.textMuted
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'members' && <ProjectMembers project={project} />}
      {activeTab === 'shows' && <Shows projectId={project.id} myRole={myRole} />}
      {activeTab === 'people' && <People projectId={project.id} myRole={myRole} />}
      {activeTab === 'roles' && <Roles projectId={project.id} myRole={myRole} />}
      {activeTab === 'providers' && <Providers projectId={project.id} myRole={myRole} />}
      {activeTab === 'roster' && <DefaultRoster projectId={project.id} myRole={myRole} />}
      {activeTab === 'venues' && <Venues projectId={project.id} myRole={myRole} />}

      {activeTab === 'conflicts' && (
        <section style={{ fontFamily: font.sans }}>
          <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
            Conflict Intelligence
          </h3>
          <p style={{ color: colors.textSecondary, maxWidth: 520, marginTop: 0, marginBottom: 24, fontSize: 14, lineHeight: 1.5 }}>
            Pro feature — detects scheduling conflicts, missing required roles, and missing
            sound providers across your upcoming shows.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href={`/projects/${project.id}/conflicts`}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: colors.elevated,
                border: `1px solid ${colors.borderStrong}`,
                color: colors.textPrimary,
                borderRadius: radius.md,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Open Conflict Intelligence →
            </a>
            {myRole === 'owner' && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="btn-primary"
                style={{ opacity: upgrading ? 0.6 : 1, cursor: upgrading ? 'not-allowed' : 'pointer' }}
              >
                {upgrading ? 'Redirecting…' : '⚡ Upgrade to Pro'}
              </button>
            )}
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: colors.textMuted }}>
            Opens in full view. Use your browser back button to return here.
          </p>
        </section>
      )}
    </div>
  )
}
