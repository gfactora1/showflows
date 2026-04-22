'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          opacity: role.is_active ? 1 : 0.6,
          background: role.is_active ? 'white' : '#fafafa',
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{ padding: 8 }}
              placeholder="Role name"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => saveEdit(role.id)} disabled={loading}>
                {loading ? 'Saving…' : 'Save'}
              </button>
              <button onClick={cancelEdit} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{role.name}</div>
            {!role.is_active && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>Inactive</div>
            )}
            {canEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(role)}>Edit</button>
                <button onClick={() => toggleActive(role)}>
                  {role.is_active ? 'Mark inactive' : 'Mark active'}
                </button>
                {canDelete && (
                  <button onClick={() => deleteRole(role.id)}>Delete</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Roles</h3>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add a Role</h4>
          <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input
              placeholder="Role name (e.g. Guitarist, FOH Engineer)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ padding: 8, flex: 1 }}
            />
            <button onClick={createRole} disabled={loading}>
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ opacity: 0.8 }}>No roles yet — add your first one above.</p>
        )}

        {active.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Active</h4>
            {active.map((r) => renderRole(r))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, marginTop: 20 }}>Inactive</h4>
            {inactive.map((r) => renderRole(r))}
          </>
        )}
      </div>
    </section>
  )
}