'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ShowDetail from './ShowDetail'

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

const blank = {
  title: '',
  venue_id: '',
  provider_id: '',
  starts_at: '',
  ends_at: '',
}

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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function venueLabel(venue: Venue | null | undefined) {
  if (!venue) return '—'
  const loc = [venue.city, venue.state].filter(Boolean).join(', ')
  return loc ? `${venue.name} — ${loc}` : venue.name
}

export default function Shows({ projectId, myRole }: Props) {
  const [shows, setShows] = useState<Show[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [soundProviders, setSoundProviders] = useState<Provider[]>([])
  const [selectedShow, setSelectedShow] = useState<Show | null>(null)
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(blank)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadLookups = async () => {
    const [venueRes, providerRes] = await Promise.all([
      supabase
        .from('venues')
        .select('id,name,address,city,state')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('providers')
        .select('id,name,provider_type')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .eq('provider_type', 'sound')
        .order('name', { ascending: true }),
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

    if (error) {
      setMsg(`Error loading shows: ${error.message}`)
      return
    }

    const now = Date.now()
    const all = (data ?? []) as Show[]

    const enriched = all.map((s) => ({
      ...s,
      venue: venueList.find((v) => v.id === s.venue_id) ?? null,
      provider: providerList.find((p) => p.id === s.provider_id) ?? null,
    }))

    const upcoming = enriched.filter((s) => new Date(s.starts_at).getTime() >= now)
    const past = enriched.filter((s) => new Date(s.starts_at).getTime() < now)
    setShows([...upcoming, ...past])
  }

  const refresh = async () => {
    await loadLookups()
  }

  useEffect(() => {
    refresh()
  }, [projectId])

  useEffect(() => {
    if (venues.length >= 0 && soundProviders.length >= 0) {
      loadShows(venues, soundProviders)
    }
  }, [venues, soundProviders])

  useEffect(() => {
    if (selectedShow) {
      const updated = shows.find((s) => s.id === selectedShow.id)
      if (updated) setSelectedShow(updated)
    }
  }, [shows])

  const createShow = async () => {
    setMsg('')
    if (!form.title.trim()) return setMsg('Title is required.')
    if (!form.venue_id) return setMsg('Please select a venue.')
    if (!form.starts_at) return setMsg('Start time is required.')
    if (!form.ends_at) return setMsg('End time is required.')
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      return setMsg('End time must be after start time.')
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('shows').insert({
        project_id: projectId,
        title: form.title.trim(),
        venue_id: form.venue_id || null,
        provider_id: form.provider_id || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      })

      if (error) throw error

      setForm(blank)
      await refresh()
    } catch (e: any) {
      setMsg(`Error creating show: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (show: Show) => {
    setEditingId(show.id)
    setEditForm({
      title: show.title,
      venue_id: show.venue_id ?? '',
      provider_id: show.provider_id ?? '',
      starts_at: toLocalDatetimeValue(show.starts_at),
      ends_at: toLocalDatetimeValue(show.ends_at),
    })
    setMsg('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(blank)
    setMsg('')
  }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.title.trim()) return setMsg('Title is required.')
    if (!editForm.venue_id) return setMsg('Please select a venue.')
    if (!editForm.starts_at) return setMsg('Start time is required.')
    if (!editForm.ends_at) return setMsg('End time is required.')
    if (new Date(editForm.ends_at) <= new Date(editForm.starts_at)) {
      return setMsg('End time must be after start time.')
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('shows')
        .update({
          title: editForm.title.trim(),
          venue_id: editForm.venue_id || null,
          provider_id: editForm.provider_id || null,
          starts_at: new Date(editForm.starts_at).toISOString(),
          ends_at: new Date(editForm.ends_at).toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      setEditingId(null)
      setEditForm(blank)
      await refresh()
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
    if (error) {
      setMsg(`Error deleting show: ${error.message}`)
      return
    }

    if (selectedShow?.id === id) setSelectedShow(null)
    await refresh()
  }

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

  const now = Date.now()
  const upcoming = shows.filter((s) => new Date(s.starts_at).getTime() >= now)
  const past = shows.filter((s) => new Date(s.starts_at).getTime() < now)

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
        style={{ padding: 8 }}
      />
      <select
        value={values.venue_id}
        onChange={(e) => set({ ...values, venue_id: e.target.value })}
        style={{ padding: 8 }}
      >
        <option value="">— Select a venue —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {venueLabel(v)}
          </option>
        ))}
      </select>
      {venues.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
          No venues yet — add one in the Venues tab first.
        </p>
      )}
      <select
        value={values.provider_id}
        onChange={(e) => set({ ...values, provider_id: e.target.value })}
        style={{ padding: 8 }}
      >
        <option value="">— Sound provider (optional) —</option>
        {soundProviders.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {soundProviders.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
          No sound providers yet — add one in the Providers tab.
        </p>
      )}
      <label style={{ fontSize: 13, opacity: 0.8 }}>
        Start
        <input
          type="datetime-local"
          value={values.starts_at}
          onChange={(e) => {
            const newStart = e.target.value
            const updatedForm = { ...values, starts_at: newStart }
            if (
              newStart &&
              (!values.ends_at || new Date(values.ends_at) <= new Date(newStart))
            ) {
              updatedForm.ends_at = addOneHour(newStart)
            }
            set(updatedForm)
          }}
          style={{ padding: 8, marginLeft: 8 }}
        />
      </label>
      <label style={{ fontSize: 13, opacity: 0.8 }}>
        End&nbsp;&nbsp;
        <input
          type="datetime-local"
          value={values.ends_at}
          min={values.starts_at || undefined}
          onChange={(e) => set({ ...values, ends_at: e.target.value })}
          style={{ padding: 8, marginLeft: 8 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onSubmit} disabled={loading}>
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )

  const renderShow = (show: Show, isPast: boolean) => {
    const isEditing = editingId === show.id
    return (
      <div
        key={show.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          opacity: isPast ? 0.65 : 1,
          background: isPast ? '#fafafa' : 'white',
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(show.id), cancelEdit, 'Save')
        ) : (
          <>
            <button
              onClick={() => setSelectedShow(show)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>
                {show.title}
              </div>
            </button>
            {show.venue && (
              <div style={{ marginTop: 4, fontSize: 14, opacity: 0.8 }}>
                {venueLabel(show.venue)}
              </div>
            )}
            {show.provider && (
              <div style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>
                Sound: {show.provider.name}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
              {formatDisplay(show.starts_at)} → {formatDisplay(show.ends_at)}
            </div>
            {canEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => setSelectedShow(show)}>View / Assign</button>
                <button onClick={() => startEdit(show)}>Edit</button>
                {canDelete && (
                  <button onClick={() => deleteShow(show.id)}>Delete</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <section style={{ marginTop: 0 }}>
      <h3 style={{ marginTop: 0 }}>Shows</h3>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add a Show</h4>
          {renderForm(form, setForm, createShow)}
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {upcoming.length === 0 && past.length === 0 && (
          <p style={{ opacity: 0.8 }}>No shows yet — add your first one above.</p>
        )}

        {upcoming.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Upcoming</h4>
            {upcoming.map((s) => renderShow(s, false))}
          </>
        )}

        {past.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, marginTop: 20 }}>Past</h4>
            {past.map((s) => renderShow(s, true))}
          </>
        )}
      </div>
    </section>
  )
}
