'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ProjectMembers from './ProjectMembers'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const loadProjects = async () => {
    setMsg('')
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,color,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMsg(`Error loading projects: ${error.message}`)
      return
    }

    setProjects(data ?? [])

    // keep selection in sync if project list reloads
    if (selectedProject) {
      const stillThere = (data ?? []).find((p) => p.id === selectedProject.id)
      setSelectedProject(stillThere ?? null)
    }
  }

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createProject = async () => {
    setMsg('')
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (!user?.id || !user?.email) {
      setLoading(false)
      setMsg('Not logged in.')
      return
    }

    // 1) Create project and return new row
    const { data: newProject, error: projErr } = await supabase
      .from('projects')
      .insert({
        name: trimmed,
        owner: user.id,
      })
      .select('id,name,color,created_at')
      .single()

    if (projErr || !newProject) {
      setLoading(false)
      setMsg(`Error creating project: ${projErr?.message ?? 'Unknown error'}`)
      return
    }

    // 2) Add current user as owner in project_members
    const { error: memErr } = await supabase.from('project_members').insert({
      project_id: newProject.id,
      member_email: user.email,
      role: 'owner',
      is_managed: false,
    })

    setLoading(false)

    if (memErr) {
      setMsg(
        `Project created, but failed to add owner membership: ${memErr.message}`
      )
    } else {
      setName('')
      setSelectedProject(newProject)
    }

    await loadProjects()
  }

  const seedOwnerMemberships = async () => {
    setMsg('')

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (!user?.email) {
      setMsg('Not logged in.')
      return
    }

    const { data: projs, error: pErr } = await supabase
      .from('projects')
      .select('id')

    if (pErr) {
      setMsg(`Error reading projects: ${pErr.message}`)
      return
    }

    const rows =
      (projs ?? []).map((p) => ({
        project_id: p.id,
        member_email: user.email!,
        role: 'owner',
        is_managed: false,
      })) ?? []

    if (rows.length === 0) {
      setMsg('No projects found.')
      return
    }

    const { error: iErr } = await supabase
      .from('project_members')
      .upsert(rows, { onConflict: 'project_id,member_email' })

    if (iErr) {
      setMsg(`Error seeding memberships: ${iErr.message}`)
      return
    }

    setMsg('Owner memberships seeded successfully.')
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Projects</h2>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name (e.g., Simply Phil)"
          style={{ padding: 8, width: 320 }}
        />
        <button onClick={createProject} disabled={loading}>
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>

      <button onClick={seedOwnerMemberships} style={{ marginTop: 12 }}>
        Seed owner membership (one-time)
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 32, marginTop: 16 }}>
        <div style={{ minWidth: 320 }}>
          <ul style={{ paddingLeft: 18 }}>
            {projects.map((p) => {
              const isSelected = selectedProject?.id === p.id
              return (
                <li key={p.id} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => setSelectedProject(p)}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #333' : '1px solid #ccc',
                      background: isSelected ? '#f3f3f3' : 'white',
                      padding: '8px 10px',
                      borderRadius: 8,
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: p.color,
                        marginRight: 8,
                      }}
                    />
                    {p.name}
                  </button>
                </li>
              )
            })}
          </ul>

          {projects.length === 0 && (
            <p style={{ marginTop: 12, opacity: 0.8 }}>
              No projects yet — create your first one above.
            </p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          {selectedProject ? (
            <ProjectMembers project={selectedProject} />
          ) : (
            <p style={{ opacity: 0.8 }}>
              Select a project to manage members.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}