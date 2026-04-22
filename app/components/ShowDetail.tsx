'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Show = {
  id: string
  project_id: string
  title: string
  venue_id: string | null
  starts_at: string
  ends_at: string
  notes: string | null
}

type Venue = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

type Person = {
  id: string
  display_name: string
}

type RoleRow = {
  id: string
  name: string
}

type Assignment = {
  id: string
  person_id: string
  role_id: string | null
  is_confirmed: boolean
  notes: string | null
  person?: Person
  role?: RoleRow
}

type Props = {
  show: Show
  projectId: string
  myRole: Role | null
  onBack: () => void
}

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function mapsUrl(venue: Venue) {
  const parts = [venue.address, venue.city, venue.state, venue.zip]
    .filter(Boolean)
    .join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`
}

export default function ShowDetail({ show, projectId, myRole, onBack }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [venue, setVenue] = useState<Venue | null>(null)
  const [addPersonId, setAddPersonId] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [msg, setMsg] = useState('')

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const fetchAll = async (): Promise<Assignment[]> => {
    const [assignRes, peopleRes, rolesRes] = await Promise.all([
      supabase
        .from('show_assignments')
        .select('id,person_id,role_id,is_confirmed,notes')
        .eq('show_id', show.id)
        .order('created_at', { ascending: true }),
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

    if (assignRes.error || peopleRes.error || rolesRes.error) {
      setMsg('Error loading show data.')
      return []
    }

    const peopleList = (peopleRes.data ?? []) as Person[]
    const rolesList = (rolesRes.data ?? []) as RoleRow[]
    const assignList = (assignRes.data ?? []) as Assignment[]

    const enriched = assignList.map((a) => ({
      ...a,
      person: peopleList.find((p) => p.id === a.person_id),
      role: rolesList.find((r) => r.id === a.role_id),
    }))

    setPeople(peopleList)
    setRoles(rolesList)
    setAssignments(enriched)

    return assignList
  }

  const fetchVenue = async () => {
    if (!show.venue_id) return
    const { data } = await supabase
      .from('venues')
      .select('id,name,address,city,state,zip')
      .eq('id', show.venue_id)
      .maybeSingle()
    if (data) setVenue(data as Venue)
  }

  const doSeed = async (existingAssignments: Assignment[]) => {
    const { data: rosterData, error: rosterErr } = await supabase
      .from('project_default_roster')
      .select('person_id,role_id')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (rosterErr || !rosterData || rosterData.length === 0) return 0

    const currentIds = existingAssignments.map((a) => a.person_id)
    const toInsert = rosterData.filter(
      (entry) => !currentIds.includes(entry.person_id)
    )

    if (toInsert.length === 0) return 0

    const inserts = toInsert.map((entry) => ({
      project_id: projectId,
      show_id: show.id,
      person_id: entry.person_id,
      role_id: entry.role_id,
      is_confirmed: false,
    }))

    const { error: insertErr } = await supabase
      .from('show_assignments')
      .insert(inserts)

    if (insertErr) throw insertErr

    return toInsert.length
  }

  useEffect(() => {
    const init = async () => {
      await fetchVenue()
      const existing = await fetchAll()

      if (existing.length === 0 && canEdit) {
        setSeeding(true)
        try {
          const added = await doSeed(existing)
          if (added > 0) await fetchAll()
        } catch (e: any) {
          setMsg(`Error auto-seeding: ${e?.message ?? String(e)}`)
        } finally {
          setSeeding(false)
        }
      }
    }

    init()
  }, [show.id])

  const manualSeed = async () => {
    setMsg('')
    setSeeding(true)
    try {
      const added = await doSeed(assignments)
      if (added === 0) {
        setMsg('Everyone in the default roster is already assigned to this show.')
      } else {
        await fetchAll()
        setMsg(`Added ${added} person${added !== 1 ? 's' : ''} from the default roster.`)
      }
    } catch (e: any) {
      setMsg(`Error seeding roster: ${e?.message ?? String(e)}`)
    } finally {
      setSeeding(false)
    }
  }

  const addAssignment = async () => {
    setMsg('')
    if (!addPersonId) return setMsg('Select a person.')

    const already = assignments.find((a) => a.person_id === addPersonId)
    if (already) return setMsg('That person is already assigned to this show.')

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase.from('show_assignments').insert({
        project_id: projectId,
        show_id: show.id,
        person_id: addPersonId,
        role_id: addRoleId || null,
        is_confirmed: false,
      })

      if (error) throw error

      // Fire conflict notification in background — don't block the UI
      if (user) {
        fetch(`/api/projects/${projectId}/notify-assignment-conflict`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personId: addPersonId,
            showId: show.id,
            triggeredByUserId: user.id,
          }),
        }).catch((e) => console.error('Notification error:', e))
      }

      setAddPersonId('')
      setAddRoleId('')
      await fetchAll()
    } catch (e: any) {
      setMsg(`Error adding assignment: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const updateAssignmentRole = async (assignmentId: string, roleId: string) => {
    const { error } = await supabase
      .from('show_assignments')
      .update({ role_id: roleId || null })
      .eq('id', assignmentId)

    if (error) {
      setMsg(`Error updating role: ${error.message}`)
      return
    }

    await fetchAll()
  }

  const toggleConfirmed = async (assignment: Assignment) => {
    const { error } = await supabase
      .from('show_assignments')
      .update({ is_confirmed: !assignment.is_confirmed })
      .eq('id', assignment.id)

    if (error) {
      setMsg(`Error updating: ${error.message}`)
      return
    }

    await fetchAll()
  }

  const removeAssignment = async (assignmentId: string) => {
    if (!confirm('Remove this person from the show?')) return
    setMsg('')

    const { error } = await supabase
      .from('show_assignments')
      .delete()
      .eq('id', assignmentId)

    if (error) {
      setMsg(`Error removing: ${error.message}`)
      return
    }

    await fetchAll()
  }

  const unassignedPeople = people.filter(
    (p) => !assignments.find((a) => a.person_id === p.id)
  )

  const venueDisplay = venue
    ? [venue.city, venue.state].filter(Boolean).join(', ')
    : null

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          fontSize: 14,
          color: '#555',
          marginBottom: 16,
        }}
      >
        ← Back to Shows
      </button>

      <h3 style={{ marginTop: 0 }}>{show.title}</h3>

      {venue && (
        <div style={{ fontSize: 14, marginBottom: 4 }}>
          <span style={{ fontWeight: 500 }}>{venue.name}</span>
          {venueDisplay && (
            <span style={{ opacity: 0.7 }}> — {venueDisplay}</span>
          )}
          {(venue.address || venue.city) && (
            <a
              href={mapsUrl(venue)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 10, fontSize: 13, color: '#0070f3' }}
            >
              Get directions
            </a>
          )}
        </div>
      )}

      <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
        {formatDisplay(show.starts_at)} → {formatDisplay(show.ends_at)}
      </div>

      <hr style={{ margin: '16px 0', borderColor: '#eee' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h4 style={{ margin: 0 }}>
          Lineup
          {seeding && (
            <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6, marginLeft: 10 }}>
              Loading roster…
            </span>
          )}
        </h4>

        {canEdit && !seeding && (
          <button onClick={manualSeed} style={{ fontSize: 13 }}>
            Seed from default roster
          </button>
        )}
      </div>

      {canEdit && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={addPersonId}
              onChange={(e) => setAddPersonId(e.target.value)}
              style={{ padding: 8 }}
            >
              <option value="">— Add person —</option>
              {unassignedPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>

            <select
              value={addRoleId}
              onChange={(e) => setAddRoleId(e.target.value)}
              style={{ padding: 8 }}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <button onClick={addAssignment} disabled={loading || !addPersonId}>
              {loading ? 'Adding…' : 'Add to show'}
            </button>
          </div>
        </div>
      )}

      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}

      {assignments.length === 0 && !seeding ? (
        <p style={{ opacity: 0.75 }}>
          No one assigned yet.
          {canEdit && ' Use "Seed from default roster" above, or add people manually.'}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                Person
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                Role
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                Confirmed
              </th>
              {canEdit && (
                <th style={{ borderBottom: '1px solid #ddd', padding: 8 }} />
              )}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                  {a.person?.display_name ?? '—'}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                  {canEdit ? (
                    <select
                      value={a.role_id ?? ''}
                      onChange={(e) => updateAssignmentRole(a.id, e.target.value)}
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
                    a.role?.name ?? '—'
                  )}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                  <input
                    type="checkbox"
                    checked={a.is_confirmed}
                    onChange={() => toggleConfirmed(a)}
                    disabled={!canEdit}
                  />
                </td>
                {canEdit && (
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                    {canDelete && (
                      <button onClick={() => removeAssignment(a.id)}>Remove</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
