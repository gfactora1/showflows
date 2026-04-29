'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font } from './tokens'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Person = {
  id: string
  display_name: string
}

type RoleRow = {
  id: string
  name: string
}

type RosterEntry = {
  id: string
  project_id: string
  person_id: string
  role_id: string | null
  sort_order: number
  person?: Person
  role?: RoleRow
}

type Props = {
  projectId: string
  myRole: Role | null
}

export default function DefaultRoster({ projectId, myRole }: Props) {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [newRoleName, setNewRoleName]     = useState('')
  const [creatingRole, setCreatingRole]   = useState(false)

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadAll = async () => {
    const [rosterRes, peopleRes, rolesRes] = await Promise.all([
      supabase
        .from('project_default_roster')
        .select('id,project_id,person_id,role_id,sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('people')
        .select('id,display_name')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('display_name', { ascending: true }),
      supabase
        .from('roles')
        .select('id,name')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])

    if (rosterRes.error) { setMsg(rosterRes.error.message); return }
    if (peopleRes.error) { setMsg(peopleRes.error.message); return }
    if (rolesRes.error) { setMsg(rolesRes.error.message); return }

    const peopleList = (peopleRes.data ?? []) as Person[]
    const rolesList = (rolesRes.data ?? []) as RoleRow[]
    const rosterList = (rosterRes.data ?? []) as RosterEntry[]

    const enriched = rosterList.map((entry) => ({
      ...entry,
      person: peopleList.find((p) => p.id === entry.person_id),
      role: rolesList.find((r) => r.id === entry.role_id),
    }))

    setRoster(enriched)
    setPeople(peopleList)
    setRoles(rolesList)

    const available = peopleList.filter(
      (p) => !rosterList.find((r) => r.person_id === p.id)
    )
    setSelectedPersonId(available.length > 0 ? available[0].id : '')
    setSelectedRoleId('')
  }

  useEffect(() => {
    loadAll()
  }, [projectId])

  const createInlineRole = async () => {
    const name = newRoleName.trim()
    if (!name) return
    setCreatingRole(true)
    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({ project_id: projectId, name, is_active: true })
        .select('id,name,is_active,sort_order,created_at')
        .single()
      if (error) throw error
      await loadAll()
      setSelectedRoleId(data.id)
      setNewRoleName('')
    } catch (e: any) {
      setMsg(`Error creating role: ${e?.message ?? String(e)}`)
    } finally {
      setCreatingRole(false)
    }
  }

  const addToRoster = async () => {
    if (selectedRoleId === '__new__') return setMsg('Please finish creating the new role first.')
    setMsg('')
    if (!selectedPersonId) return setMsg('Select a person.')

    const alreadyAdded = roster.find((r) => r.person_id === selectedPersonId)
    if (alreadyAdded) return setMsg('That person is already in the default roster.')

    setLoading(true)
    try {
      const maxOrder = roster.length > 0
        ? Math.max(...roster.map((r) => r.sort_order))
        : 0

      const { error } = await supabase.from('project_default_roster').insert({
        project_id: projectId,
        person_id: selectedPersonId,
        role_id: selectedRoleId || null,
        sort_order: maxOrder + 1,
      })

      if (error) throw error

      await loadAll()
    } catch (e: any) {
      setMsg(`Error adding to roster: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const updateRole = async (entryId: string, roleId: string) => {
    const { error } = await supabase
      .from('project_default_roster')
      .update({ role_id: roleId || null })
      .eq('id', entryId)

    if (error) {
      setMsg(`Error updating role: ${error.message}`)
      return
    }

    await loadAll()
  }

  const removeFromRoster = async (entryId: string) => {
    setMsg('')

    const { error } = await supabase
      .from('project_default_roster')
      .delete()
      .eq('id', entryId)

    if (error) {
      setMsg(`Error removing: ${error.message}`)
      return
    }

    await loadAll()
  }

  const availablePeople = people.filter(
    (p) => !roster.find((r) => r.person_id === p.id)
  )

  // shared cell style for the table
  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 14,
    color: colors.textPrimary,
    verticalAlign: 'middle',
  }

  const headerCellStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.borderStrong}`,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'left' as const,
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Default Roster
      </h3>
      <p style={{ color: colors.textSecondary, marginTop: 0, marginBottom: 20, fontSize: 14, maxWidth: 560, lineHeight: 1.5 }}>
        Define the core lineup for this project. When a new show is created, these
        assignments will be pre-populated automatically. You can adjust per-show as needed.
      </p>

      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Add to Default Roster
          </div>
          {availablePeople.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>
              All active people are already in the default roster.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="input-select"
                style={{ fontFamily: font.sans, minWidth: 160 }}
              >
                <option value="">— Select person —</option>
                {availablePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>

              {selectedRoleId === '__new__' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder="Role name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createInlineRole()}
                    className="input-field"
                    style={{ fontFamily: font.sans, minWidth: 120, padding: '5px 8px' }}
                  />
                  <button
                    onClick={createInlineRole}
                    disabled={creatingRole || !newRoleName.trim()}
                    className="btn-primary"
                    style={{ fontFamily: font.sans, fontSize: 13, padding: '5px 10px' }}
                  >
                    {creatingRole ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setSelectedRoleId(''); setNewRoleName('') }}
                    className="btn-secondary"
                    style={{ fontFamily: font.sans, fontSize: 13, padding: '5px 10px' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="input-select"
                  style={{ fontFamily: font.sans, minWidth: 140 }}
                >
                  <option value="">No role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value="__new__">+ Add new role…</option>
                </select>
              )}

              <button
                onClick={addToRoster}
                disabled={loading || !selectedPersonId}
                className="btn-primary"
              >
                {loading ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: colors.red }}>
          {msg}
        </p>
      )}

      <div>
        {roster.length === 0 ? (
          <p style={{ color: colors.textMuted, fontSize: 14 }}>
            No default roster yet — add your core players above.
          </p>
        ) : (
          <div style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: colors.card }}>
                  <th style={headerCellStyle}>Person</th>
                  <th style={headerCellStyle}>Default Role</th>
                  {canDelete && (
                    <th style={{ ...headerCellStyle, width: 80 }} />
                  )}
                </tr>
              </thead>
              <tbody>
                {roster.map((entry) => (
                  <tr key={entry.id}>
                    <td style={cellStyle}>
                      {entry.person?.display_name ?? '—'}
                    </td>
                    <td style={cellStyle}>
                      {canEdit ? (
                        <select
                          value={entry.role_id ?? ''}
                          onChange={(e) => updateRole(entry.id, e.target.value)}
                          className="input-select"
                          style={{ fontFamily: font.sans, fontSize: 13, padding: '4px 8px' }}
                        >
                          <option value="">No role</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: entry.role ? colors.textPrimary : colors.textMuted }}>
                          {entry.role?.name ?? '—'}
                        </span>
                      )}
                    </td>
                    {canDelete && (
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => setPendingDelete({ id: entry.id, name: entry.person?.display_name ?? 'this person' })}
                          className="btn-link-danger"
                          style={{ fontSize: 13 }}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pendingDelete && (
        <>
          <div onClick={() => setPendingDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: '24px 24px 20px', width: 'min(380px, calc(100vw - 32px))', zIndex: 1001, fontFamily: font.sans }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Remove &ldquo;{pendingDelete.name}&rdquo; from roster?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.textSecondary }}>This will remove the assignment from the default roster.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDelete(null)} className="btn-secondary" style={{ fontFamily: font.sans }}>Cancel</button>
              <button
                onClick={() => { removeFromRoster(pendingDelete.id); setPendingDelete(null) }}
                style={{ fontFamily: font.sans, padding: '7px 16px', background: colors.red, color: 'white', border: 'none', borderRadius: radius.md, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >Remove</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
