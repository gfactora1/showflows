'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font } from './tokens'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type RoleRow = {
  id: string
  project_id: string
  name: string
  is_active: boolean
  sort_order: number
  created_at: string
}

type Props = {
  projectId: string
  myRole: Role | null
}

export default function Roles({ projectId, myRole }: Props) {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadRoles = async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('id,project_id,name,is_active,sort_order,created_at')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (error) {
      setMsg(`Error loading roles: ${error.message}`)
      return
    }

    setRoles((data ?? []) as RoleRow[])
  }

  useEffect(() => {
    loadRoles()
  }, [projectId])

  const createRole = async () => {
    setMsg('')
    if (!newName.trim()) return setMsg('Role name is required.')

    setLoading(true)
    try {
      const maxOrder = roles.length > 0
        ? Math.max(...roles.map((r) => r.sort_order))
        : 0

      const { error } = await supabase.from('roles').insert({
        project_id: projectId,
        name: newName.trim(),
        is_active: true,
        sort_order: maxOrder + 1,
      })

      if (error) throw error

      setNewName('')
      await loadRoles()
    } catch (e: any) {
      setMsg(`Error adding role: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (role: RoleRow) => {
    setEditingId(role.id)
    setEditName(role.name)
    setMsg('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setMsg('')
  }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editName.trim()) return setMsg('Role name is required.')

    setLoading(true)
    try {
      const { error } = await supabase
        .from('roles')
        .update({ name: editName.trim() })
        .eq('id', id)

      if (error) throw error

      setEditingId(null)
      setEditName('')
      await loadRoles()
    } catch (e: any) {
      setMsg(`Error saving: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (role: RoleRow) => {
    const { error } = await supabase
      .from('roles')
      .update({ is_active: !role.is_active })
      .eq('id', role.id)

    if (error) {
      setMsg(`Error updating: ${error.message}`)
      return
    }

    await loadRoles()
  }

  const deleteRole = async (id: string) => {
    if (!confirm('Delete this role? This cannot be undone.')) return
    setMsg('')

    const { error } = await supabase.from('roles').delete().eq('id', id)
    if (error) {
      setMsg(`Error deleting role: ${error.message}`)
      return
    }

    await loadRoles()
  }

  const active = roles.filter((r) => r.is_active)
  const inactive = roles.filter((r) => !r.is_active)

  const renderRole = (role: RoleRow) => {
    const isEditing = editingId === role.id
    return (
      <div
        key={role.id}
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          marginBottom: 8,
          opacity: role.is_active ? 1 : 0.55,
          fontFamily: font.sans,
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Role name"
              className="input-field"
              style={{ fontFamily: font.sans }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => saveEdit(role.id)}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={loading}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>
                {role.name}
              </span>
              {!role.is_active && (
                <span style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  background: colors.elevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.full,
                  padding: '1px 8px',
                }}>
                  Inactive
                </span>
              )}
            </div>
            {canEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(role)} className="btn-secondary" style={{ fontSize: 13, padding: '4px 12px' }}>
                  Edit
                </button>
                <button onClick={() => toggleActive(role)} className="btn-secondary" style={{ fontSize: 13, padding: '4px 12px' }}>
                  {role.is_active ? 'Mark inactive' : 'Mark active'}
                </button>
                {canDelete && (
                  <button onClick={() => deleteRole(role.id)} className="btn-link-danger" style={{ fontSize: 13 }}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Roles
      </h3>

      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Add a Role
          </div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input
              placeholder="Role name (e.g. Guitarist, FOH Engineer)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createRole()}
              className="input-field"
              style={{ flex: 1, fontFamily: font.sans }}
            />
            <button onClick={createRole} disabled={loading} className="btn-primary">
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: colors.red }}>
          {msg}
        </p>
      )}

      <div>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ color: colors.textMuted, fontSize: 14 }}>
            No roles yet — add your first one above.
          </p>
        )}

        {active.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Active
            </div>
            {active.map((r) => renderRole(r))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 20 }}>
              Inactive
            </div>
            {inactive.map((r) => renderRole(r))}
          </>
        )}
      </div>
    </section>
  )
}
