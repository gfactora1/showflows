'use client'

import { useState, useEffect, useRef } from 'react'
import { colors, radius, font, transition } from './tokens'
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

type Tab = 'shows' | 'venues' | 'roster' | 'people' | 'roles' | 'providers' | 'members' | 'conflicts' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'shows',     label: 'Shows' },
  { key: 'venues',    label: 'Venues' },
  { key: 'roster',    label: 'Default Roster' },
  { key: 'people',    label: 'People' },
  { key: 'roles',     label: 'Roles' },
  { key: 'providers', label: 'Providers' },
  { key: 'conflicts', label: '⚡ Conflicts' },
  { key: 'members',   label: 'Members' },
  { key: 'settings',  label: 'Settings' },
]

type Props = {
  project: Project
  myRole: Role | null
  onProjectDeleted?: (projectId: string) => void
}

type DeleteStep = 'confirm' | 'deleting' | 'done'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ── Delete Project Modal ──────────────────────────────────────

function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project
  onClose: () => void
  onDeleted: () => void
}) {
  const [step, setStep]                 = useState<DeleteStep>('confirm')
  const [typedName, setTypedName]       = useState('')
  const [checked, setChecked]           = useState(false)
  const [error, setError]               = useState('')
  const [purgeAfter, setPurgeAfter]     = useState<string | null>(null)
  const [recoveryDays, setRecoveryDays] = useState<number>(14)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = new Date(Date.now() + recoveryDays * 24 * 60 * 60 * 1000)
    setPurgeAfter(d.toISOString())
  }, [recoveryDays])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && step === 'confirm') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, step])

  const nameMatches = typedName.trim() === project.name.trim()
  const canDelete   = nameMatches && checked && step === 'confirm'

  const handleDelete = async () => {
    if (!canDelete) return
    setError('')
    setStep('deleting')

    try {
      const res = await fetch(`/api/projects/${project.id}/delete`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setStep('confirm')
        return
      }

      setRecoveryDays(data.recoveryDays ?? 14)
      setPurgeAfter(data.purgeAfter ?? null)
      setStep('done')
    } catch (e: any) {
      setError(e?.message ?? 'Network error. Please try again.')
      setStep('confirm')
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  }

  const modal: React.CSSProperties = {
    background: colors.surface,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radius.xl,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 480,
    fontFamily: font.sans,
  }

  // Done state
  if (step === 'done') {
    return (
      <div style={overlay} onClick={onDeleted}>
        <div style={modal} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🗑️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
            Project deleted
          </h2>
          <p style={{ margin: '0 0 6px', fontSize: 14, color: colors.textSecondary }}>
            <strong style={{ color: colors.textPrimary }}>{project.name}</strong> has been removed from your workspace.
          </p>
          {purgeAfter && (
            <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
              You can restore it for{' '}
              <strong style={{ color: colors.textPrimary }}>{recoveryDays} days</strong>
              {' '}(until <strong style={{ color: colors.textPrimary }}>{formatDate(purgeAfter)}</strong>).
              After that, all data will be permanently deleted.
            </p>
          )}
          <p style={{ margin: '0 0 24px', fontSize: 13, color: colors.textMuted }}>
            A confirmation email has been sent with restore instructions.
          </p>
          <button
            onClick={onDeleted}
            className="btn-primary"
            style={{ fontFamily: font.sans, width: '100%' }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Confirm / deleting state
  return (
    <div style={overlay} onClick={step === 'confirm' ? onClose : undefined}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>

        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
          Delete "{project.name}"?
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary }}>
          This will remove the project from your active workspace.
        </p>

        {/* What gets deleted */}
        <div style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderLeft: `3px solid ${colors.red}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            All associated data will be removed
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.7 }}>
            Shows · People · Members · Roles · Venues · Providers · Songs · Rosters · Schedule data
          </div>
        </div>

        {/* Recovery window */}
        <div style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}>
          🛟{' '}
          {purgeAfter
            ? <>You can restore this project for <strong style={{ color: colors.textPrimary }}>{recoveryDays} days</strong> (until <strong style={{ color: colors.textPrimary }}>{formatDate(purgeAfter)}</strong>). After that, deletion becomes permanent.</>
            : <>Your data remains recoverable during your recovery window.</>
          }
        </div>

        {/* Type project name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>
            Type <strong style={{ color: colors.textPrimary }}>{project.name}</strong> to confirm
          </label>
          <input
            ref={inputRef}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canDelete && handleDelete()}
            placeholder={project.name}
            className="input-field"
            style={{
              fontFamily: font.sans,
              width: '100%',
              boxSizing: 'border-box',
              borderColor: typedName.length > 0
                ? nameMatches ? colors.green : colors.red
                : undefined,
            }}
            disabled={step === 'deleting'}
          />
        </div>

        {/* Checkbox */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          cursor: step === 'deleting' ? 'not-allowed' : 'pointer',
          marginBottom: 20,
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={step === 'deleting'}
            style={{ marginTop: 2, flexShrink: 0, accentColor: colors.violet }}
          />
          I understand this project will be permanently deleted after the recovery window
          {purgeAfter && <> — {recoveryDays} days, on {formatDate(purgeAfter)}</>}.
        </label>

        {/* Error */}
        {error && (
          <div style={{
            background: colors.redSoft,
            border: `1px solid rgba(239,68,68,0.25)`,
            borderRadius: radius.md,
            padding: '10px 12px',
            marginBottom: 16,
            fontSize: 13,
            color: colors.red,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={step === 'deleting'}
            className="btn-secondary"
            style={{ fontFamily: font.sans }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || step === 'deleting'}
            style={{
              fontFamily: font.sans,
              padding: '8px 18px',
              background: canDelete ? colors.red : colors.elevated,
              color: canDelete ? 'white' : colors.textMuted,
              border: 'none',
              borderRadius: radius.md,
              fontSize: 14,
              fontWeight: 600,
              cursor: canDelete ? 'pointer' : 'not-allowed',
              transition: transition.normal,
            }}
          >
            {step === 'deleting' ? 'Deleting…' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────

function SettingsTab({
  project,
  myRole,
  onProjectDeleted,
}: {
  project: Project
  myRole: Role | null
  onProjectDeleted?: (projectId: string) => void
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleDeleted = () => {
    setShowDeleteModal(false)
    onProjectDeleted?.(project.id)
  }

  return (
    <section style={{ fontFamily: font.sans, maxWidth: 600 }}>

      {/* Project name display */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
          Project Settings
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          General project configuration.
        </p>
        <div style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: project.color, flexShrink: 0,
          }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
            {project.name}
          </span>
        </div>
      </div>

      {/* Danger Zone — owner only */}
      {myRole === 'owner' && (
        <div style={{
          border: `1px solid rgba(239,68,68,0.3)`,
          borderRadius: radius.lg,
          overflow: 'hidden',
        }}>
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            borderBottom: `1px solid rgba(239,68,68,0.2)`,
            padding: '10px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.red, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Danger Zone
            </div>
          </div>
          <div style={{
            background: colors.surface,
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 2 }}>
                Delete this project
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>
                Removes the project from your workspace. Recoverable within your recovery window.
              </div>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                fontFamily: font.sans,
                padding: '8px 16px',
                background: 'transparent',
                color: colors.red,
                border: `1px solid rgba(239,68,68,0.4)`,
                borderRadius: radius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                transition: transition.normal,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.redSoft
                e.currentTarget.style.borderColor = colors.red
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
              }}
            >
              Delete Project
            </button>
          </div>
        </div>
      )}

      {myRole !== 'owner' && (
        <div style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '14px 16px',
          fontSize: 13,
          color: colors.textMuted,
        }}>
          Only the project owner can manage project settings and deletion.
        </div>
      )}

      {showDeleteModal && (
        <DeleteProjectModal
          project={project}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleDeleted}
        />
      )}
    </section>
  )
}

// ── Main ──────────────────────────────────────────────────────

export default function ProjectDetail({ project, myRole, onProjectDeleted }: Props) {
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
      <div style={{
        display: 'flex',
        gap: 2,
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = colors.violetSoft
                  e.currentTarget.style.color = colors.textSecondary
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colors.textMuted
                }
              }}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderBottom: isActive ? `2px solid ${colors.violet}` : '2px solid transparent',
                marginBottom: -1,
                background: isActive ? colors.violetSoft2 : 'transparent',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                color: isActive ? colors.textPrimary : colors.textMuted,
                fontFamily: font.sans,
                borderRadius: `${radius.sm} ${radius.sm} 0 0`,
                transition: transition.normal,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'members'   && <ProjectMembers project={project} />}
      {activeTab === 'shows'     && <Shows projectId={project.id} myRole={myRole} />}
      {activeTab === 'people'    && <People projectId={project.id} myRole={myRole} />}
      {activeTab === 'roles'     && <Roles projectId={project.id} myRole={myRole} />}
      {activeTab === 'providers' && <Providers projectId={project.id} myRole={myRole} />}
      {activeTab === 'roster'    && <DefaultRoster projectId={project.id} myRole={myRole} />}
      {activeTab === 'venues'    && <Venues projectId={project.id} myRole={myRole} />}
      {activeTab === 'settings'  && (
        <SettingsTab
          project={project}
          myRole={myRole}
          onProjectDeleted={onProjectDeleted}
        />
      )}

      {activeTab === 'conflicts' && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
            Conflict Intelligence
          </h3>
          <p style={{ maxWidth: 520, marginBottom: 20, fontSize: 14, color: colors.textSecondary }}>
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
                color: colors.textPrimary,
                borderRadius: radius.md,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                border: `1px solid ${colors.borderStrong}`,
              }}
            >
              Open Conflict Intelligence →
            </a>
            {myRole === 'owner' && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="btn-primary"
                style={{ fontFamily: font.sans }}
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
