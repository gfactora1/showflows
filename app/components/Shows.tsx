'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ShowDetail from './ShowDetail'
import { colors, radius, font, transition } from './tokens'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Show = {
  id: string
  project_id: string
  title: string
  venue_id: string | null
  provider_id: string | null
  starts_at: string
  ends_at: string
  load_in_at: string | null
  notes: string | null
  created_at: string
  venue?: Venue | null
  provider?: Provider | null
}

type Venue = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
}

type Provider = {
  id: string
  name: string
  provider_type: string
}

type Props = {
  projectId: string
  myRole: Role | null
}

const blank = { title: '', venue_id: '', provider_id: '', starts_at: '', ends_at: '' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addOneHour(localDatetime: string): string {
  if (!localDatetime) return ''
  const d = new Date(localDatetime)
  d.setHours(d.getHours() + 1)
  return toLocalDatetimeValue(d.toISOString())
}

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function formatDateShort(iso: string) {
  const d = new Date(iso)
  return {
    month: d.toLocaleString(undefined, { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
  }
}

function venueLabel(venue: Venue | null | undefined) {
  if (!venue) return null
  const loc = [venue.city, venue.state].filter(Boolean).join(', ')
  return loc ? `${venue.name} — ${loc}` : venue.name
}

// ── Shared input / select style ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 11px',
  background: colors.elevated,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.md,
  color: colors.textPrimary,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  fontFamily: font.sans,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px',
  background: colors.violet,
  border: 'none',
  borderRadius: radius.md,
  color: 'white',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const btnGhost: React.CSSProperties = {
  padding: '5px 12px',
  background: 'transparent',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.sm,
  color: colors.textPrimary,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const btnDanger: React.CSSProperties = {
  padding: '5px 12px',
  background: 'transparent',
  border: `1px solid rgba(239,68,68,0.35)`,
  borderRadius: radius.sm,
  color: colors.red,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Shows({ projectId, myRole }: Props) {
  const [shows, setShows]               = useState<Show[]>([])
  const [venues, setVenues]             = useState<Venue[]>([])
  const [soundProviders, setSoundProviders] = useState<Provider[]>([])
  const [selectedShow, setSelectedShow] = useState<Show | null>(null)
  const [form, setForm]                 = useState(blank)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editForm, setEditForm]         = useState(blank)
  const [loading, setLoading]           = useState(false)
  const [msg, setMsg]                   = useState('')

  // Inline venue creation — shown when user picks "Create new venue" in the select
  const [showNewVenueForm, setShowNewVenueForm] = useState(false)
  const [newVenueForm, setNewVenueForm] = useState({ name: '', address: '', city: '', state: '', zip: '' })
  const [savingVenue, setSavingVenue]   = useState(false)
  const [newVenueMsg, setNewVenueMsg]   = useState('')

  const canEdit  = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const createVenueInline = async (forForm: 'add' | 'edit') => {
    setNewVenueMsg('')
    if (!newVenueForm.name.trim()) return setNewVenueMsg('Venue name is required.')
    if (!newVenueForm.city.trim()) return setNewVenueMsg('City is required.')
    setSavingVenue(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('venues')
        .insert({
          project_id: projectId,
          name: newVenueForm.name.trim(),
          address: newVenueForm.address.trim() || null,
          city: newVenueForm.city.trim() || null,
          state: newVenueForm.state.trim() || null,
          zip: newVenueForm.zip.trim() || null,
          is_active: true,
          created_by_user_id: userData?.user?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      // Reload venues then auto-select the new one
      await loadLookups()
      const newId = data.id
      if (forForm === 'add') setForm((f) => ({ ...f, venue_id: newId }))
      else setEditForm((f) => ({ ...f, venue_id: newId }))
      setShowNewVenueForm(false)
      setNewVenueForm({ name: '', address: '', city: '', state: '', zip: '' })
      setNewVenueMsg('')
    } catch (e: any) {
      setNewVenueMsg(`Error creating venue: ${e?.message ?? String(e)}`)
    } finally {
      setSavingVenue(false)
    }
  }

  const loadLookups = async () => {
    const [venueRes, providerRes] = await Promise.all([
      supabase.from('venues').select('id,name,address,city,state')
        .eq('project_id', projectId).eq('is_active', true).order('name', { ascending: true }),
      supabase.from('providers').select('id,name,provider_type')
        .eq('project_id', projectId).eq('is_active', true)
        .eq('provider_type', 'sound').order('name', { ascending: true }),
    ])
    setVenues((venueRes.data ?? []) as Venue[])
    setSoundProviders((providerRes.data ?? []) as Provider[])
  }

  const loadShows = async (venueList: Venue[], providerList: Provider[]) => {
    const { data, error } = await supabase
      .from('shows')
      .select('id,project_id,title,venue_id,provider_id,starts_at,ends_at,load_in_at,notes,created_at')
      .eq('project_id', projectId)
      .order('starts_at', { ascending: true })
    if (error) { setMsg(`Error loading shows: ${error.message}`); return }

    const enriched = ((data ?? []) as Show[]).map((s) => ({
      ...s,
      venue:    venueList.find((v) => v.id === s.venue_id) ?? null,
      provider: providerList.find((p) => p.id === s.provider_id) ?? null,
    }))
    const now = Date.now()
    const upcoming = enriched.filter((s) => new Date(s.starts_at).getTime() >= now)
    const past     = enriched.filter((s) => new Date(s.starts_at).getTime() <  now)
    setShows([...upcoming, ...past])
  }

  useEffect(() => { loadLookups() }, [projectId])
  useEffect(() => { loadShows(venues, soundProviders) }, [venues, soundProviders])
  useEffect(() => {
    if (selectedShow) {
      const updated = shows.find((s) => s.id === selectedShow.id)
      if (updated) setSelectedShow(updated)
    }
  }, [shows])

  const createShow = async () => {
    setMsg('')
    if (!form.title.trim())        return setMsg('Title is required.')
    if (!form.venue_id)            return setMsg('Please select a venue.')
    if (!form.starts_at)           return setMsg('Start time is required.')
    if (!form.ends_at)             return setMsg('End time is required.')
    if (new Date(form.ends_at) <= new Date(form.starts_at))
      return setMsg('End time must be after start time.')

    setLoading(true)
    try {
      const { error } = await supabase.from('shows').insert({
        project_id:  projectId,
        title:       form.title.trim(),
        venue_id:    form.venue_id    || null,
        provider_id: form.provider_id || null,
        starts_at:   new Date(form.starts_at).toISOString(),
        ends_at:     new Date(form.ends_at).toISOString(),
      })
      if (error) throw error
      setForm(blank)
      await loadLookups()
    } catch (e: any) {
      setMsg(`Error creating show: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (show: Show) => {
    setEditingId(show.id)
    setEditForm({
      title:       show.title,
      venue_id:    show.venue_id    ?? '',
      provider_id: show.provider_id ?? '',
      starts_at:   toLocalDatetimeValue(show.starts_at),
      ends_at:     toLocalDatetimeValue(show.ends_at),
    })
    setMsg('')
  }

  const cancelEdit = () => { setEditingId(null); setEditForm(blank); setMsg('') }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.title.trim())    return setMsg('Title is required.')
    if (!editForm.venue_id)        return setMsg('Please select a venue.')
    if (!editForm.starts_at)       return setMsg('Start time is required.')
    if (!editForm.ends_at)         return setMsg('End time is required.')
    if (new Date(editForm.ends_at) <= new Date(editForm.starts_at))
      return setMsg('End time must be after start time.')

    setLoading(true)
    try {
      const { error } = await supabase.from('shows').update({
        title:       editForm.title.trim(),
        venue_id:    editForm.venue_id    || null,
        provider_id: editForm.provider_id || null,
        starts_at:   new Date(editForm.starts_at).toISOString(),
        ends_at:     new Date(editForm.ends_at).toISOString(),
      }).eq('id', id)
      if (error) throw error
      setEditingId(null)
      setEditForm(blank)
      await loadLookups()
    } catch (e: any) {
      setMsg(`Error saving show: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteShow = async (id: string) => {
    if (!confirm('Delete this show? This cannot be undone.')) return
    setMsg('')
    const { error } = await supabase.from('shows').delete().eq('id', id)
    if (error) { setMsg(`Error deleting show: ${error.message}`); return }
    if (selectedShow?.id === id) setSelectedShow(null)
    await loadLookups()
  }

  // ── Show detail view ────────────────────────────────────────────────────────
  if (selectedShow) {
    return (
      <ShowDetail
        show={selectedShow}
        projectId={projectId}
        myRole={myRole}
        onBack={() => setSelectedShow(null)}
      />
    )
  }

  const now      = Date.now()
  const upcoming = shows.filter((s) => new Date(s.starts_at).getTime() >= now)
  const past     = shows.filter((s) => new Date(s.starts_at).getTime() <  now)

  // ── Add / edit form ─────────────────────────────────────────────────────────
  const renderForm = (
    values: typeof blank,
    set: (v: typeof blank) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Create Show'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
      <input
        placeholder="Title (e.g. Friday Night at The Chance)"
        value={values.title}
        onChange={(e) => set({ ...values, title: e.target.value })}
        style={inputStyle}
      />
      {/* Venue select — with inline "Create new venue" option */}
      <select
        value={values.venue_id}
        onChange={(e) => {
          if (e.target.value === '__new__') {
            setShowNewVenueForm(true)
            set({ ...values, venue_id: '' })
          } else {
            setShowNewVenueForm(false)
            set({ ...values, venue_id: e.target.value })
          }
        }}
        style={selectStyle}
      >
        <option value="">— Select a venue —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>{venueLabel(v)}</option>
        ))}
        <option value="__new__">+ Create new venue…</option>
      </select>

      {/* Inline venue creation form */}
      {showNewVenueForm && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.borderStrong}`,
          borderLeft: `3px solid ${colors.violet}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 2 }}>
            New Venue
          </div>
          <input
            placeholder="Venue name (required)"
            value={newVenueForm.name}
            onChange={(e) => setNewVenueForm({ ...newVenueForm, name: e.target.value })}
            style={inputStyle}
            autoFocus
          />
          <input
            placeholder="Street address (optional)"
            value={newVenueForm.address}
            onChange={(e) => setNewVenueForm({ ...newVenueForm, address: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              placeholder="City (required)"
              value={newVenueForm.city}
              onChange={(e) => setNewVenueForm({ ...newVenueForm, city: e.target.value })}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="State"
              value={newVenueForm.state}
              onChange={(e) => setNewVenueForm({ ...newVenueForm, state: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Zip"
              value={newVenueForm.zip}
              onChange={(e) => setNewVenueForm({ ...newVenueForm, zip: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          {newVenueMsg && (
            <p style={{ fontSize: 12, color: colors.red, margin: 0 }}>{newVenueMsg}</p>
          )}
          <div style={{ display: 'flex', gap: 7, marginTop: 2 }}>
            <button
              onClick={() => createVenueInline(values === form ? 'add' : 'edit')}
              disabled={savingVenue}
              style={{ ...btnPrimary, fontSize: 12, padding: '5px 14px', opacity: savingVenue ? 0.6 : 1 }}
            >
              {savingVenue ? 'Saving…' : 'Save venue'}
            </button>
            <button
              onClick={() => { setShowNewVenueForm(false); setNewVenueForm({ name: '', address: '', city: '', state: '', zip: '' }); setNewVenueMsg('') }}
              style={{ ...btnGhost, fontSize: 12 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <select
        value={values.provider_id}
        onChange={(e) => set({ ...values, provider_id: e.target.value })}
        style={selectStyle}
      >
        <option value="">— Sound provider (optional) —</option>
        {soundProviders.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {soundProviders.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
          No sound providers yet — add one in Settings → Planning Defaults.
        </p>
      )}

      <label style={{ fontSize: 13, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
        Start
        <input
          type="datetime-local"
          value={values.starts_at}
          onChange={(e) => {
            const newStart  = e.target.value
            const updated   = { ...values, starts_at: newStart }
            if (newStart && (!values.ends_at || new Date(values.ends_at) <= new Date(newStart))) {
              updated.ends_at = addOneHour(newStart)
            }
            set(updated)
          }}
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
        />
      </label>

      <label style={{ fontSize: 13, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
        End&nbsp;&nbsp;
        <input
          type="datetime-local"
          value={values.ends_at}
          min={values.starts_at || undefined}
          onChange={(e) => set({ ...values, ends_at: e.target.value })}
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onSubmit}
          disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={loading} style={btnGhost}>Cancel</button>
        )}
      </div>
    </div>
  )

  // ── Show card ───────────────────────────────────────────────────────────────
  const renderShow = (show: Show, isPast: boolean) => {
    const isEditing = editingId === show.id
    const { month, day } = formatDateShort(show.starts_at)
    const vLabel = venueLabel(show.venue)

    return (
      <div
        key={show.id}
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '14px 16px',
          marginBottom: 8,
          opacity: isPast ? 0.8 : 1,
          transition: `opacity ${transition.normal}`,
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(show.id), cancelEdit, 'Save')
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

            {/* Date block */}
            <div style={{
              background: isPast ? colors.elevated : colors.violetSoft2,
              border: `1px solid ${isPast ? colors.border : 'rgba(124,58,237,0.3)'}`,
              borderRadius: radius.md,
              width: 46, height: 46,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isPast ? colors.textMuted : colors.violetLight,
              }}>
                {month}
              </div>
              <div style={{
                fontSize: 19, fontWeight: 700, lineHeight: 1,
                color: isPast ? colors.textMuted : colors.violetLight,
              }}>
                {day}
              </div>
            </div>

            {/* Show info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setSelectedShow(show)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  fontWeight: 600, fontSize: 14,
                  color: colors.textPrimary,
                  marginBottom: 3,
                }}>
                  {show.title}
                </div>
              </button>

              {vLabel && (
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>
                  {vLabel}
                </div>
              )}
              {show.provider && (
                <div style={{ fontSize: 12, color: colors.textMuted }}>
                  Sound: {show.provider.name}
                </div>
              )}
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
                {formatDisplay(show.starts_at)} → {formatDisplay(show.ends_at)}
              </div>

              {canEdit && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setSelectedShow(show)} style={btnGhost}>
                    View / Assign
                  </button>
                  <button onClick={() => startEdit(show)} style={btnGhost}>
                    Edit
                  </button>
                  {canDelete && (
                    <button onClick={() => deleteShow(show.id)} style={btnDanger}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 20, color: colors.textPrimary, fontSize: 16, fontWeight: 600 }}>
        Shows
      </h3>

      {/* Add a show form */}
      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: 16,
          marginBottom: 28,
        }}>
          <h4 style={{
            margin: '0 0 12px', fontSize: 13, fontWeight: 600,
            color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Add a Show
          </h4>
          {renderForm(form, setForm, createShow)}
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: colors.red }}>{msg}</p>
      )}

      {/* Show lists */}
      <div>
        {upcoming.length === 0 && past.length === 0 && (
          <p style={{ fontSize: 13, color: colors.textMuted }}>
            No shows yet — add your first one above.
          </p>
        )}

        {upcoming.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 8,
            }}>
              Upcoming — {upcoming.length}
            </div>
            {upcoming.map((s) => renderShow(s, false))}
          </>
        )}

        {past.length > 0 && (
          <div style={{ marginTop: upcoming.length > 0 ? 28 : 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 8,
            }}>
              Past — {past.length}
            </div>
            {past.map((s) => renderShow(s, true))}
          </div>
        )}
      </div>
    </section>
  )
}
