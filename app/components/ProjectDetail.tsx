'use client'

import { useState } from 'react'
import ProjectMembers from './ProjectMembers'
import Shows from './Shows'
import People from './People'
import Roles from './Roles'
import Providers from './Providers'
import DefaultRoster from './DefaultRoster'
import Venues from './Venues'

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

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '2px solid #ddd',
          marginBottom: 20,
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
                padding: '8px 16px',
                border: 'none',
                borderBottom: isActive ? '2px solid #333' : '2px solid transparent',
                marginBottom: -2,
                background: 'none',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                color: isActive ? '#111' : '#666',
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
        <section>
          <h3 style={{ marginTop: 0 }}>Conflict Intelligence</h3>
          <p style={{ opacity: 0.75, maxWidth: 520, marginBottom: 20 }}>
            Pro feature — detects scheduling conflicts, missing required roles, and missing
            sound providers across your upcoming shows.
          </p>
          <a
            href={`/projects/${project.id}/conflicts`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#111',
              color: 'white',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Conflict Intelligence →
          </a>
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.6 }}>
            Opens in full view. Use your browser back button to return here.
          </p>
        </section>
      )}
    </div>
  )
}
