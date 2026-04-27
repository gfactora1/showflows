'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'
import SetlistBuilder from './SetlistBuilder'
import SongPickerModal from './SongPickerModal'

type Role = 'owner' | 'editor' | 'member' | 'readonly'
type Tab  = 'lineup' | 'setlist'

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
  id: string; name: string
  address: string | null; city: string | null
  state: string | null;   zip: string | null
}

type Person    = { id: string; display_name: string }
type RoleRow   = { id: string; name: string }

type Assignment = {
  id: string; person_id: string; role_id: string | null
  is_confirmed: boolean; notes: string | null
  person?: Person; role?: RoleRow
}

type SetlistSong = {
  order: number; set: number; title: string; key: string
  notes: string; uses_backing_track: boolean; library_song_id?: string | null
}

type PersonalNote = { id: string; song_order: number; notes: string }

type LibrarySong = {
  id: string; title: string; artist: string | null
  key: string | null; notes: string | null; uses_backing_track: boolean
}

type Props = {
  show: Show; projectId: string
  myRole: Role | null; onBack: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function mapsUrl(v: Venue) {
  const parts = [v.address, v.city, v.state, v.zip].filter(Boolean).join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: colors.elevated,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.md,
  color: colors.textPrimary,
  fontSize: 13, outline: 'none',
  fontFamily: font.sans, cursor: 'pointer',
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px', background: colors.violet,
  border: 'none', borderRadius: radius.md,
  color: 'white', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: font.sans, whiteSpace: 'nowrap',
}

const btnGhost: React.CSSProperties = {
  padding: '5px 12px', background: 'transparent',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.sm, color: colors.textPrimary,
  fontSize: 12, cursor: 'pointer', fontFamily: font.sans,
}

const btnDanger: React.CSSProperties = {
  padding: '5px 12px', background: 'transparent',
  border: `1px solid rgba(252,129,129,0.35)`,
  borderRadius: radius.sm, color: colors.red,
  fontSize: 12, cursor: 'pointer', fontFamily: font.sans,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowDetail({ show, projectId, myRole, onBack }: Props) {
  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('lineup')

  // ── Lineup state ───────────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [people, setPeople]           = useState<Person[]>([])
  const [roles, setRoles]             = useState<RoleRow[]>([])
  const [venue, setVenue]             = useState<Venue | null>(null)
  const [addPersonId, setAddPersonId] = useState('')
  const [addRoleId, setAddRoleId]     = useState('')
  const [loading, setLoading]         = useState(false)
  const [seeding, setSeeding]         = useState(false)
  const [msg, setMsg]                 = useState('')

  // ── Setlist state ──────────────────────────────────────────────────────────
  const [setlistSongs, setSetlistSongs]     = useState<SetlistSong[]>([])
  const [personalNotes, setPersonalNotes]   = useState<Record<number, PersonalNote>>({})
  const [librarySongs, setLibrarySongs]     = useState<LibrarySong[]>([])
  const [showPicker, setShowPicker]         = useState(false)
  const [savingSetlist, setSavingSetlist]   = useState(false)
  const [setlistMsg, setSetlistMsg]         = useState('')
  const [editingNote, setEditingNote]       = useState<number | null>(null)
  const [noteInput, setNoteInput]           = useState('')
  const [savingNote, setSavingNote]         = useState(false)
  const [addingCustomSong, setAddingCustomSong] = useState(false)
  const [customSongForm, setCustomSongForm] = useState({ title: '', key: '', notes: '' })

  const canEdit  = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  // ── Lineup data ────────────────────────────────────────────────────────────

  const fetchAll = async (): Promise<Assignment[]> => {
    const [assignRes, peopleRes, rolesRes] = await Promise.all([
      supabase.from('show_assignments')
        .select('id,person_id,role_id,is_confirmed,notes')
        .eq('show_id', show.id).order('created_at', { ascending: true }),
      supabase.from('people')
        .select('id,display_name')
        .eq('project_id', projectId).eq('is_active', true)
        .order('display_name', { ascending: true }),
      supabase.from('roles')
        .select('id,name')
        .eq('project_id', projectId).eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])
    if (assignRes.error || peopleRes.error || rolesRes.error) { setMsg('Error loading show data.'); return [] }
    const peopleList = (peopleRes.data ?? []) as Person[]
    const rolesList  = (rolesRes.data  ?? []) as RoleRow[]
    const assignList = (assignRes.data ?? []) as Assignment[]
    const enriched   = assignList.map((a) => ({
      ...a,
      person: peopleList.find((p) => p.id === a.person_id),
      role:   rolesList.find((r)  => r.id === a.role_id),
    }))
    setPeople(peopleList); setRoles(rolesList); setAssignments(enriched)
    return assignList
  }

  const fetchVenue = async () => {
    if (!show.venue_id) return
    const { data } = await supabase.from('venues')
      .select('id,name,address,city,state,zip')
      .eq('id', show.venue_id).maybeSingle()
    if (data) setVenue(data as Venue)
  }

  const doSeed = async (existing: Assignment[]) => {
    const { data: rosterData, error } = await supabase
      .from('project_default_roster').select('person_id,role_id')
      .eq('project_id', projectId).order('sort_order', { ascending: true })
    if (error || !rosterData || rosterData.length === 0) return 0
    const currentIds = existing.map((a) => a.person_id)
    const toInsert   = rosterData.filter((e) => !currentIds.includes(e.person_id))
    if (toInsert.length === 0) return 0
    const { error: insertErr } = await supabase.from('show_assignments').insert(
      toInsert.map((e) => ({ project_id: projectId, show_id: show.id, person_id: e.person_id, role_id: e.role_id, is_confirmed: false }))
    )
    if (insertErr) throw insertErr
    return toInsert.length
  }

  // ── Setlist data ───────────────────────────────────────────────────────────

  const loadSetlist = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [setlistRes, notesRes] = await Promise.all([
      supabase.from('show_setlist_songs')
        .select('id,song_order,set_number,title,key,notes,uses_backing_track,library_song_id')
        .eq('show_id', show.id).order('song_order', { ascending: true }),
      user ? supabase.from('setlist_personal_notes')
        .select('id,song_order,notes')
        .eq('show_id', show.id).eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])
    if (setlistRes.data) {
      setSetlistSongs(setlistRes.data.map((s: any) => ({
        order: s.song_order, set: s.set_number ?? 1,
        title: s.title, key: s.key ?? '', notes: s.notes ?? '',
        uses_backing_track: s.uses_backing_track ?? false,
        library_song_id: s.library_song_id ?? null,
      })))
    }
    if (notesRes.data) {
      const notesMap: Record<number, PersonalNote> = {}
      notesRes.data.forEach((n: any) => { notesMap[n.song_order] = { id: n.id, song_order: n.song_order, notes: n.notes } })
      setPersonalNotes(notesMap)
    }
  }, [show.id])

  const loadLibrarySongs = useCallback(async () => {
    const { data } = await supabase.from('project_songs')
      .select('id,title,artist,key,notes,uses_backing_track')
      .eq('project_id', projectId).eq('is_active', true)
      .order('title', { ascending: true })
    if (data) setLibrarySongs(data as LibrarySong[])
  }, [projectId])

  const saveSetlist = async (songs: SetlistSong[]) => {
    setSavingSetlist(true)
    setSetlistMsg('')
    try {
      await supabase.from('show_setlist_songs').delete().eq('show_id', show.id)
      if (songs.length > 0) {
        const { error } = await supabase.from('show_setlist_songs').insert(
          songs.map((s) => ({
            show_id: show.id, project_id: projectId,
            song_order: s.order, set_number: s.set,
            title: s.title, key: s.key || null, notes: s.notes || null,
            uses_backing_track: s.uses_backing_track,
            library_song_id: s.library_song_id ?? null,
          }))
        )
        if (error) throw error
      }
      setSetlistSongs(songs)
    } catch (e: any) {
      setSetlistMsg(`Error saving setlist: ${e?.message ?? String(e)}`)
    } finally {
      setSavingSetlist(false)
    }
  }

  const addFromLibrary = async (selected: LibrarySong[]) => {
    const maxOrder = setlistSongs.length > 0 ? Math.max(...setlistSongs.map((s) => s.order)) : 0
    const newSongs: SetlistSong[] = selected.map((s, i) => ({
      order: maxOrder + i + 1, set: 0,
      title: s.title, key: s.key ?? '', notes: s.notes ?? '',
      uses_backing_track: s.uses_backing_track,
      library_song_id: s.id,
    }))
    const updated = [...setlistSongs, ...newSongs]
    setShowPicker(false)
    await saveSetlist(updated)
  }

  const addCustomSong = async () => {
    if (!customSongForm.title.trim()) return
    const maxOrder = setlistSongs.length > 0 ? Math.max(...setlistSongs.map((s) => s.order)) : 0
    const newSong: SetlistSong = {
      order: maxOrder + 1, set: 0,
      title: customSongForm.title.trim(),
      key: customSongForm.key.trim(),
      notes: customSongForm.notes.trim(),
      uses_backing_track: false,
      library_song_id: null,
    }
    const updated = [...setlistSongs, newSong]
    setAddingCustomSong(false)
    setCustomSongForm({ title: '', key: '', notes: '' })
    await saveSetlist(updated)
  }

  const removeSong = async (index: number) => {
    const updated = setlistSongs.filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i + 1 }))
    await saveSetlist(updated)
  }

  const handleSongsChange = async (songs: SetlistSong[]) => {
    await saveSetlist(songs)
  }

  const handleEditNote = (songOrder: number) => {
    setEditingNote(songOrder)
    setNoteInput(personalNotes[songOrder]?.notes ?? '')
  }

  const handleSaveNote = async (songOrder: number) => {
    setSavingNote(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const existing = personalNotes[songOrder]
      if (existing) {
        if (noteInput.trim()) {
          await supabase.from('setlist_personal_notes')
            .update({ notes: noteInput.trim() }).eq('id', existing.id)
        } else {
          await supabase.from('setlist_personal_notes').delete().eq('id', existing.id)
        }
      } else if (noteInput.trim()) {
        await supabase.from('setlist_personal_notes').insert({
          show_id: show.id, user_id: user.id,
          song_order: songOrder, notes: noteInput.trim(),
        })
      }
      await loadSetlist()
    } catch (e: any) {
      setSetlistMsg(`Error saving note: ${e?.message ?? String(e)}`)
    } finally {
      setSavingNote(false)
      setEditingNote(null)
      setNoteInput('')
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────

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
    loadSetlist()
    loadLibrarySongs()
  }, [show.id])

  const manualSeed = async () => {
    setMsg(''); setSeeding(true)
    try {
      const added = await doSeed(assignments)
      if (added === 0) setMsg('Everyone in the default roster is already assigned.')
      else { await fetchAll(); setMsg(`Added ${added} person${added !== 1 ? 's' : ''} from the default roster.`) }
    } catch (e: any) {
      setMsg(`Error seeding roster: ${e?.message ?? String(e)}`)
    } finally { setSeeding(false) }
  }

  const addAssignment = async () => {
    setMsg('')
    if (!addPersonId) return setMsg('Select a person.')
    if (assignments.find((a) => a.person_id === addPersonId))
      return setMsg('That person is already assigned to this show.')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('show_assignments').insert({
        project_id: projectId, show_id: show.id,
        person_id: addPersonId, role_id: addRoleId || null, is_confirmed: false,
      })
      if (error) throw error
      if (user) {
        fetch(`/api/projects/${projectId}/notify-assignment-conflict`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId: addPersonId, showId: show.id, triggeredByUserId: user.id }),
        }).catch((e) => console.error('Notification error:', e))
      }
      setAddPersonId(''); setAddRoleId('')
      await fetchAll()
    } catch (e: any) {
      setMsg(`Error adding assignment: ${e?.message ?? String(e)}`)
    } finally { setLoading(false) }
  }

  const updateAssignmentRole = async (id: string, roleId: string) => {
    const { error } = await supabase.from('show_assignments').update({ role_id: roleId || null }).eq('id', id)
    if (error) setMsg(`Error updating role: ${error.message}`)
    else await fetchAll()
  }

  const toggleConfirmed = async (a: Assignment) => {
    const { error } = await supabase.from('show_assignments').update({ is_confirmed: !a.is_confirmed }).eq('id', a.id)
    if (error) setMsg(`Error updating: ${error.message}`)
    else await fetchAll()
  }

  const removeAssignment = async (id: string) => {
    if (!confirm('Remove this person from the show?')) return
    setMsg('')
    const { error } = await supabase.from('show_assignments').delete().eq('id', id)
    if (error) setMsg(`Error removing: ${error.message}`)
    else await fetchAll()
  }

  const unassignedPeople = people.filter((p) => !assignments.find((a) => a.person_id === p.id))
  const venueDisplay     = venue ? [venue.city, venue.state].filter(Boolean).join(', ') : null
  const alreadyInSetlist = new Set(setlistSongs.map((s) => s.library_song_id).filter(Boolean) as string[])

  // ── Tab button style ───────────────────────────────────────────────────────

  const tabBtn = (tab: Tab): React.CSSProperties => ({
    padding: '7px 18px',
    background: activeTab === tab ? colors.card : 'transparent',
    border: `1px solid ${activeTab === tab ? colors.borderStrong : 'transparent'}`,
    borderRadius: radius.md,
    color: activeTab === tab ? colors.textPrimary : colors.textMuted,
    fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
    cursor: 'pointer', fontFamily: font.sans,
    transition: `all ${transition.normal}`,
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font.sans }}>

      {/* Back */}
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontSize: 13, color: colors.blue, fontFamily: font.sans, marginBottom: 20 }}>
        ← Back to Shows
      </button>

      {/* Show title */}
      <h3 style={{ marginTop: 0, marginBottom: 10, color: colors.textPrimary, fontSize: 18, fontWeight: 600 }}>
        {show.title}
      </h3>

      {/* Venue */}
      {venue && (
        <div style={{ fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500, color: colors.textPrimary }}>{venue.name}</span>
          {venueDisplay && <span style={{ color: colors.textSecondary }}>— {venueDisplay}</span>}
          {(venue.address || venue.city) && (
            <a href={mapsUrl(venue)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: colors.blue, textDecoration: 'none' }}>
              Get directions →
            </a>
          )}
        </div>
      )}

      {/* Date/time */}
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
        {formatDisplay(show.starts_at)} → {formatDisplay(show.ends_at)}
      </div>

      <div style={{ height: 1, background: colors.border, marginBottom: 20 }} />

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 4, width: 'fit-content' }}>
        <button onClick={() => setActiveTab('lineup')} style={tabBtn('lineup')}>Lineup</button>
        <button onClick={() => setActiveTab('setlist')} style={tabBtn('setlist')}>Setlist</button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LINEUP TAB                                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lineup' && (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <h4 style={{ margin: 0, color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>
              Lineup
              {seeding && <span style={{ fontSize: 13, fontWeight: 400, color: colors.textMuted, marginLeft: 10 }}>Loading roster…</span>}
            </h4>
            {canEdit && !seeding && (
              <button onClick={manualSeed} style={btnGhost}>Seed from default roster</button>
            )}
          </div>

          {/* Add person */}
          {canEdit && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={addPersonId} onChange={(e) => setAddPersonId(e.target.value)} style={selectStyle}>
                  <option value="">— Add person —</option>
                  {unassignedPeople.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)} style={selectStyle}>
                  <option value="">No role</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button onClick={addAssignment} disabled={loading || !addPersonId}
                  style={{ ...btnPrimary, opacity: loading || !addPersonId ? 0.5 : 1, cursor: loading || !addPersonId ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Adding…' : 'Add to show'}
                </button>
              </div>
            </div>
          )}

          {msg && <p style={{ marginBottom: 12, fontSize: 13, color: colors.red }}>{msg}</p>}

          {assignments.length === 0 && !seeding ? (
            <p style={{ fontSize: 13, color: colors.textMuted }}>
              No one assigned yet.{canEdit && ' Use "Seed from default roster" above, or add people manually.'}
            </p>
          ) : (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.sans }}>
                <thead>
                  <tr style={{ background: colors.card }}>
                    {['Person', 'Role', 'Confirmed', canEdit ? '' : null].filter(Boolean).map((h) => (
                      <th key={h as string} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, fontSize: 13 }}>
                        {a.person?.display_name ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
                        {canEdit ? (
                          <select value={a.role_id ?? ''} onChange={(e) => updateAssignmentRole(a.id, e.target.value)}
                            style={{ ...selectStyle, padding: '5px 8px', fontSize: 12 }}>
                            <option value="">No role</option>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: a.role ? colors.textSecondary : colors.textMuted }}>{a.role?.name ?? '—'}</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}` }}>
                        {canEdit ? (
                          <button onClick={() => toggleConfirmed(a)}
                            style={{ padding: '3px 10px', borderRadius: radius.full, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: font.sans, background: a.is_confirmed ? colors.greenSoft : colors.elevated, color: a.is_confirmed ? colors.green : colors.textMuted, transition: `background ${transition.normal}, color ${transition.normal}` }}>
                            {a.is_confirmed ? '✓ Confirmed' : 'Unconfirmed'}
                          </button>
                        ) : (
                          <span style={{ padding: '3px 10px', borderRadius: radius.full, fontSize: 11, fontWeight: 600, background: a.is_confirmed ? colors.greenSoft : colors.elevated, color: a.is_confirmed ? colors.green : colors.textMuted }}>
                            {a.is_confirmed ? '✓ Confirmed' : 'Unconfirmed'}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right' }}>
                          {canDelete && <button onClick={() => removeAssignment(a.id)} style={btnDanger}>Remove</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SETLIST TAB                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'setlist' && (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>
              Setlist
              <span style={{ fontSize: 13, fontWeight: 400, color: colors.textMuted, marginLeft: 10 }}>
                {setlistSongs.length} song{setlistSongs.length !== 1 ? 's' : ''}
              </span>
              {savingSetlist && <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 8 }}>Saving…</span>}
            </h4>

            {canEdit && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button onClick={() => setShowPicker(true)} style={btnPrimary}>
                  + From Library
                </button>
                <button
                  onClick={() => setAddingCustomSong(!addingCustomSong)}
                  style={btnGhost}
                >
                  + Custom song
                </button>
              </div>
            )}
          </div>

          {/* Custom song form */}
          {addingCustomSong && canEdit && (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderLeft: `3px solid ${colors.violet}`, borderRadius: radius.md,
              padding: '12px 14px', marginBottom: 16,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>
                Add Custom Song
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  placeholder="Song title (required)"
                  value={customSongForm.title}
                  onChange={(e) => setCustomSongForm({ ...customSongForm, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomSong() }}
                  autoFocus
                  style={{ flex: 2, minWidth: 180, padding: '7px 10px', background: colors.elevated, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md, color: colors.textPrimary, fontSize: 13, outline: 'none', fontFamily: font.sans }}
                />
                <input
                  placeholder="Key (optional)"
                  value={customSongForm.key}
                  onChange={(e) => setCustomSongForm({ ...customSongForm, key: e.target.value })}
                  style={{ flex: 1, minWidth: 80, padding: '7px 10px', background: colors.elevated, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md, color: colors.textPrimary, fontSize: 13, outline: 'none', fontFamily: font.sans }}
                />
                <input
                  placeholder="Notes (optional)"
                  value={customSongForm.notes}
                  onChange={(e) => setCustomSongForm({ ...customSongForm, notes: e.target.value })}
                  style={{ flex: 2, minWidth: 140, padding: '7px 10px', background: colors.elevated, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md, color: colors.textPrimary, fontSize: 13, outline: 'none', fontFamily: font.sans }}
                />
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={addCustomSong} disabled={!customSongForm.title.trim()}
                  style={{ ...btnPrimary, fontSize: 12, padding: '5px 14px', opacity: !customSongForm.title.trim() ? 0.5 : 1, cursor: !customSongForm.title.trim() ? 'not-allowed' : 'pointer' }}>
                  Add song
                </button>
                <button onClick={() => { setAddingCustomSong(false); setCustomSongForm({ title: '', key: '', notes: '' }) }} style={btnGhost}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {setlistMsg && <p style={{ fontSize: 13, color: colors.red, marginBottom: 12 }}>{setlistMsg}</p>}

          <SetlistBuilder
            songs={setlistSongs}
            personalNotes={personalNotes}
            canEdit={canEdit}
            savingSetlist={savingSetlist}
            onSongsChange={handleSongsChange}
            onEditNote={handleEditNote}
            onRemoveSong={removeSong}
            editingNote={editingNote}
            noteInput={noteInput}
            setNoteInput={setNoteInput}
            onSaveNote={handleSaveNote}
            onCancelNote={() => { setEditingNote(null); setNoteInput('') }}
            savingNote={savingNote}
          />
        </div>
      )}

      {/* Song picker modal */}
      {showPicker && (
        <SongPickerModal
          songs={librarySongs}
          alreadyInSetlist={alreadyInSetlist}
          onAdd={addFromLibrary}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
