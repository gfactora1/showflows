'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ProjectDetail from './ProjectDetail'
import MemberShowsView from './MemberShowsView'
import { colors, radius, font } from './tokens'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Props = {
  projects: Project[]
  setProjects: (projects: Project[]) => void
  selectedProject: Project | null
  onSelectProject: (project: Project | null) => void
  myRole: Role | null
  setMyRole: (role: Role | null) => void
  viewMode: 'admin' | 'member'
  activeSection: string
  onNavigate: (section: string) => void
}

export interface ProjectsHandle {
  openCreateModal: () => void
}

function ProjectsInner(
  {
    projects,
    setProjects,
    selectedProject,
    onSelectProject,
    myRole,
    setMyRole,
    viewMode,
    activeSection,
    onNavigate,
  }: Props,
  ref: React.Ref<ProjectsHandle>
) {
  const [msg, setMsg] = useState('')

  // Create modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  useImperativeHandle(ref, () => ({
    openCreateModal: () => {
      setNewName('')
      setCreateMsg('')
      setModalOpen(true)
    },
  }))

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
      if (!stillThere) onSelectProject(null)
    }
  }

  const loadMyRole = async (projectId: string) => {
    setMyRole(null)
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

  // ESC closes modal
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalOpen])

  const createProject = async () => {
    setCreateMsg('')
    const trimmed = newName.trim()
    if (!trimmed) return setCreateMsg('Project name is required.')

    setCreating(true)
    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) throw sessErr

      const user = sessionData.session?.user
      if (!user?.id) { setCreateMsg('Not logged in.'); return }

      const { data: newProject, error: projErr } = await supabase
        .from('projects')
        .insert({ name: trimmed, owner: user.id })
        .select('id,name,color,created_at')
        .single()

      if (projErr || !newProject) {
        throw new Error(projErr?.message ?? 'Unknown error creating project')
      }

      setModalOpen(false)
      setNewName('')
      onSelectProject(newProject as Project)
      await loadProjects()
    } catch (e: any) {
      setCreateMsg(`Error: ${e?.message ?? String(e)}`)
    } finally {
      setCreating(false)
    }
  }

  function CreateModal() {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 900,
          }}
        />
        {/* Dialog */}
        <div
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radius.xl,
            padding: '28px 28px 24px',
            width: 'min(440px, calc(100vw - 32px))',
            zIndex: 901,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            fontFamily: font.sans,
          }}
        >
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>
            Create Project
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
            Give your project a name — you can always rename it later.
          </p>

          <input
            autoFocus
            placeholder="e.g. Simply Phil, The Groove Collective"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            className="input-field"
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: font.sans, marginBottom: 8 }}
          />

          {createMsg && (
            <p style={{ fontSize: 12, color: colors.red, margin: '0 0 12px' }}>
              {createMsg}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              onClick={() => setModalOpen(false)}
              disabled={creating}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={createProject}
              disabled={creating || !newName.trim()}
              className="btn-primary"
            >
              {creating ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Member mode: full-width schedule ──
  if (viewMode === 'member') {
    return (
      <>
        <MemberShowsView projects={projects} />
        {modalOpen && <CreateModal />}
      </>
    )
  }

  // ── Admin mode: sidebar + content ──
  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 0, fontFamily: font.sans }}>

      {/* Sidebar */}
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        padding: '20px 12px',
        overflowY: 'auto',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 10,
          paddingLeft: 4,
        }}>
          Projects
        </div>

        {projects.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.textMuted, paddingLeft: 4 }}>
            No projects yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {projects.map((p) => {
              const isSelected = selectedProject?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: radius.md,
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: font.sans,
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                    background: isSelected ? colors.violetSoft2 : 'transparent',
                    transition: 'background 0.12s ease, color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = colors.violetSoft
                      e.currentTarget.style.color = colors.textPrimary
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = colors.textSecondary
                    }
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: p.color ?? colors.violet,
                  }} />
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 12, color: colors.red, marginTop: 12, paddingLeft: 4 }}>
            {msg}
          </p>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto' }}>
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            myRole={myRole}
            viewMode={viewMode}
            activeSection={activeSection as any}
            onNavigate={onNavigate as any}
            onProjectDeleted={(deletedId) => {
              setProjects(projects.filter((p) => p.id !== deletedId))
              onSelectProject(null)
            }}
          />
        ) : (
          <div style={{ paddingTop: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: colors.textMuted }}>
              Select a project to get started.
            </p>
          </div>
        )}
      </div>

      {modalOpen && <CreateModal />}
    </div>
  )
}

const Projects = forwardRef<ProjectsHandle, Props>(ProjectsInner)
Projects.displayName = 'Projects'

export default Projects
