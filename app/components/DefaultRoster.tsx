'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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

    // Always reset selectedPersonId to the first available person
    const available = peopleList.filter(
      (p) => !rosterList.find((r) => r.person_id === p.id)
    )
    setSelectedPersonId(available.length > 0 ? available[0].id : '')
    setSelectedRoleId('')
  }

  useEffect(() => {
    loadAll()
  }, [projectId])

  const addToRoster = async () => {
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
    if (!confirm('Remove from default roster?')) return
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

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Default Roster</h3>
      <p style={{ opacity: 0.75, marginTop: 0, marginBottom: 16, maxWidth: 560 }}>
        Define the core lineup for this project. When a new show is created, these
        assignments will be pre-populated automatically. You can adjust per-show as needed.
      </p>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add to Default Roster</h4>
          {availablePeople.length === 0 ? (
            <p style={{ opacity: 0.7 }}>
              All active people are already in the default roster.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                style={{ padding: 8 }}
              >
                <option value="">— Select person —</option>
                {availablePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>

              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                style={{ padding: 8 }}
              >
                <option value="">No role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <button onClick={addToRoster} disabled={loading || !selectedPersonId}>
                {loading ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {roster.length === 0 ? (
          <p style={{ opacity: 0.8 }}>
            No default roster yet — add your core players above.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  Person
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  Default Role
                </th>
                {canDelete && (
                  <th style={{ borderBottom: '1px solid #ddd', padding: 8 }} />
                )}
              </tr>
            </thead>
            <tbody>
              {roster.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    {entry.person?.display_name ?? '—'}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    {canEdit ? (
                      <select
                        value={entry.role_id ?? ''}
                        onChange={(e) => updateRole(entry.id, e.target.value)}
                        style={{ padding: 6 }}
                      >
                        <option value="">No role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      entry.role?.name ?? '—'
                    )}
                  </td>
                  {canDelete && (
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                      <button onClick={() => removeFromRoster(entry.id)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}