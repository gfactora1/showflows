'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ProjectDetail from './ProjectDetail'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

type Role = 'owner' | 'editor' | 'member' | 'readonly'

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [myRole, setMyRole] = useState<Role | null>(null)
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

    const rows = (data ?? []) as Project[]
    setProjects(rows)

    if (selectedProject) {
      const stillThere = rows.find((p) => p.id === selectedProject.id)
      setSelectedProject(stillThere ?? null)
    }
  }

  const loadMyRole = async (projectId: string) => {
    const { data: userData } = await supabase.auth.getUser()
    const email = userData?.user?.email?.trim().toLowerCase() ?? ''
    if (!email) return

    const { data } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('member_email', email)
      .maybeSingle()

    setMyRole((data?.role as Role) ?? null)
  }

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedProject) {
      loadMyRole(selectedProject.id)
    } else {
      setMyRole(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id])

  const createProject = async () => {
    setMsg('')
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) throw sessErr

      const user = sessionData.session?.user
      if (!user?.id) {
        setMsg('Not logged in.')
        return
      }

      const { data: newProject, error: projErr } = await supabase
        .from('projects')
        .insert({ name: trimmed, owner: user.id })
        .select('id,name,color,created_at')
        .single()

      if (projErr || !newProject) {
        throw new Error(projErr?.message ?? 'Unknown error creating project')
      }

      setName('')
      setSelectedProject(newProject as Project)
      await loadProjects()
    } catch (e: any) {
      setMsg(`Error creating project: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
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

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 32, marginTop: 16 }}>
        <div style={{ minWidth: 220 }}>
          <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
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
                        background: p.color ?? '#ccc',
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

        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedProject ? (
            <ProjectDetail project={selectedProject} myRole={myRole} />
          ) : (
            <p style={{ opacity: 0.8 }}>Select a project to get started.</p>
          )}
        </div>
      </div>
    </section>
  )
}