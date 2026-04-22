'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Venue = {
  id: string
  project_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  is_active: boolean
  created_by_user_id: string | null
}

type VenueContact = {
  id: string
  venue_id: string
  name: string
  phone: string | null
  email: string | null
  contact_type: string
  notes: string | null
}

type Props = {
  projectId: string
  myRole: Role | null
}

const CONTACT_TYPES = ['booking', 'day-of', 'general', 'other']

const blankVenue = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
}

const blankContact = {
  name: '',
  phone: '',
  email: '',
  contact_type: 'general',
  notes: '',
}

function mapsUrl(venue: Venue) {
  const parts = [venue.address, venue.city, venue.state, venue.zip]
    .filter(Boolean)
    .join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`
}

export default function Venues({ projectId, myRole }: Props) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [libraryVenues, setLibraryVenues] = useState<Venue[]>([])
  const [contacts, setContacts] = useState<Record<string, VenueContact[]>>({})
  const [form, setForm] = useState(blankVenue)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(blankVenue)
  const [addingContactForVenueId, setAddingContactForVenueId] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState(blankContact)
  const [librarySearch, setLibrarySearch] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const isOwner = myRole === 'owner'
  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadVenues = async () => {
    const { data, error } = await supabase
      .from('venues')
      .select('id,project_id,name,address,city,state,zip,notes,is_active,created_by_user_id')
      .eq('project_id', projectId)
      .order('name', { ascending: true })

    if (error) {
      setMsg(`Error loading venues: ${error.message}`)
      return
    }

    const list = (data ?? []) as Venue[]
    setVenues(list)

    if (isOwner && list.length > 0) {
      await loadContacts(list.map((v) => v.id))
    }
  }

  const loadContacts = async (venueIds: string[]) => {
    if (venueIds.length === 0) return

    const { data, error } = await supabase
      .from('venue_contacts')
      .select('id,venue_id,name,phone,email,contact_type,notes')
      .in('venue_id', venueIds)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) return

    const grouped: Record<string, VenueContact[]> = {}
    for (const c of (data ?? []) as VenueContact[]) {
      if (!grouped[c.venue_id]) grouped[c.venue_id] = []
      grouped[c.venue_id].push(c)
    }
    setContacts(grouped)
  }

  const loadLibrary = async () => {
    if (!isOwner) return

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id
    if (!userId) return

    const { data, error } = await supabase
      .from('venues')
      .select('id,project_id,name,address,city,state,zip,notes,is_active,created_by_user_id')
      .eq('created_by_user_id', userId)
      .neq('project_id', projectId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) return
    setLibraryVenues((data ?? []) as Venue[])
  }

  useEffect(() => {
    loadVenues()
    if (isOwner) loadLibrary()
  }, [projectId, myRole])

  const createVenue = async () => {
    setMsg('')
    if (!form.name.trim()) return setMsg('Venue name is required.')
    if (!form.address.trim()) return setMsg('Address is required.')
    if (!form.city.trim()) return setMsg('City is required.')

    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      const { error } = await supabase.from('venues').insert({
        project_id: projectId,
        name: form.name.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        notes: form.notes.trim() || null,
        is_active: true,
        created_by_user_id: userId ?? null,
      })

      if (error) throw error

      setForm(blankVenue)
      await loadVenues()
      if (isOwner) await loadLibrary()
    } catch (e: any) {
      setMsg(`Error adding venue: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const addFromLibrary = async (venue: Venue) => {
    setMsg('')
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      const { error } = await supabase.from('venues').insert({
        project_id: projectId,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        notes: venue.notes,
        is_active: true,
        created_by_user_id: userId ?? null,
      })

      if (error) throw error

      setShowLibrary(false)
      setLibrarySearch('')
      await loadVenues()
      await loadLibrary()
    } catch (e: any) {
      setMsg(`Error adding from library: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (venue: Venue) => {
    setEditingId(venue.id)
    setEditForm({
      name: venue.name,
      address: venue.address ?? '',
      city: venue.city ?? '',
      state: venue.state ?? '',
      zip: venue.zip ?? '',
      notes: venue.notes ?? '',
    })
    setMsg('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(blankVenue)
    setMsg('')
  }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.name.trim()) return setMsg('Venue name is required.')
    if (!editForm.address.trim()) return setMsg('Address is required.')
    if (!editForm.city.trim()) return setMsg('City is required.')

    setLoading(true)
    try {
      const { error } = await supabase
        .from('venues')
        .update({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          city: editForm.city.trim() || null,
          state: editForm.state.trim() || null,
          zip: editForm.zip.trim() || null,
          notes: editForm.notes.trim() || null,
        })
        .eq('id', id)

      if (error) throw error

      setEditingId(null)
      setEditForm(blankVenue)
      await loadVenues()
    } catch (e: any) {
      setMsg(`Error saving venue: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (venue: Venue) => {
    const { error } = await supabase
      .from('venues')
      .update({ is_active: !venue.is_active })
      .eq('id', venue.id)

    if (error) {
      setMsg(`Error updating: ${error.message}`)
      return
    }

    await loadVenues()
  }

  const deleteVenue = async (id: string) => {
    if (!confirm('Delete this venue? This cannot be undone.')) return
    setMsg('')

    const { error } = await supabase.from('venues').delete().eq('id', id)
    if (error) {
      setMsg(`Error deleting venue: ${error.message}`)
      return
    }

    await loadVenues()
    if (isOwner) await loadLibrary()
  }

  const addContact = async (venueId: string) => {
    setMsg('')
    if (!contactForm.name.trim()) return setMsg('Contact name is required.')

    setLoading(true)
    try {
      const { error } = await supabase.from('venue_contacts').insert({
        venue_id: venueId,
        project_id: projectId,
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim() || null,
        email: contactForm.email.trim() || null,
        contact_type: contactForm.contact_type,
        notes: contactForm.notes.trim() || null,
      })

      if (error) throw error

      setAddingContactForVenueId(null)
      setContactForm(blankContact)
      await loadContacts(venues.map((v) => v.id))
    } catch (e: any) {
      setMsg(`Error adding contact: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteContact = async (contactId: string) => {
    if (!confirm('Remove this contact?')) return

    const { error } = await supabase
      .from('venue_contacts')
      .delete()
      .eq('id', contactId)

    if (error) {
      setMsg(`Error removing contact: ${error.message}`)
      return
    }

    await loadContacts(venues.map((v) => v.id))
  }

  const active = venues.filter((v) => v.is_active)
  const inactive = venues.filter((v) => !v.is_active)

  const filteredLibrary = libraryVenues.filter(
    (v) =>
      librarySearch.trim() === '' ||
      v.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      (v.city ?? '').toLowerCase().includes(librarySearch.toLowerCase())
  )

  const alreadyInProject = new Set(venues.map((v) => v.name.toLowerCase()))

  const renderVenueForm = (
    values: typeof blankVenue,
    set: (v: typeof blankVenue) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Add Venue'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
      <input
        placeholder="Venue name (e.g. The Chance Theater)"
        value={values.name}
        onChange={(e) => set({ ...values, name: e.target.value })}
        style={{ padding: 8 }}
      />
      <input
        placeholder="Street address"
        value={values.address}
        onChange={(e) => set({ ...values, address: e.target.value })}
        style={{ padding: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="City"
          value={values.city}
          onChange={(e) => set({ ...values, city: e.target.value })}
          style={{ padding: 8, flex: 2 }}
        />
        <input
          placeholder="State"
          value={values.state}
          onChange={(e) => set({ ...values, state: e.target.value })}
          style={{ padding: 8, flex: 1 }}
        />
        <input
          placeholder="Zip"
          value={values.zip}
          onChange={(e) => set({ ...values, zip: e.target.value })}
          style={{ padding: 8, flex: 1 }}
        />
      </div>
      <input
        placeholder="Notes (optional — parking, load-in door, etc.)"
        value={values.notes}
        onChange={(e) => set({ ...values, notes: e.target.value })}
        style={{ padding: 8 }}
      />
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

  const renderContacts = (venue: Venue) => {
    if (!isOwner) return null
    const venueContacts = contacts[venue.id] ?? []
    const isAddingContact = addingContactForVenueId === venue.id

    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
          Contacts (admin only)
        </div>

        {venueContacts.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {venueContacts.map((c) => (
              <div
                key={c.id}
                style={{
                  fontSize: 13,
                  padding: '6px 0',
                  borderBottom: '1px solid #f5f5f5',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 12 }}>
                    ({c.contact_type})
                  </span>
                  {c.phone && <div style={{ opacity: 0.75 }}>{c.phone}</div>}
                  {c.email && <div style={{ opacity: 0.75 }}>{c.email}</div>}
                  {c.notes && (
                    <div style={{ opacity: 0.6, fontStyle: 'italic' }}>{c.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteContact(c.id)}
                  style={{ fontSize: 12, flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {isAddingContact ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
            <input
              placeholder="Contact name"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              style={{ padding: 7, fontSize: 13 }}
            />
            <select
              value={contactForm.contact_type}
              onChange={(e) => setContactForm({ ...contactForm, contact_type: e.target.value })}
              style={{ padding: 7, fontSize: 13 }}
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <input
              placeholder="Phone (optional)"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              style={{ padding: 7, fontSize: 13 }}
            />
            <input
              placeholder="Email (optional)"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              style={{ padding: 7, fontSize: 13 }}
            />
            <input
              placeholder="Notes (optional)"
              value={contactForm.notes}
              onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              style={{ padding: 7, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => addContact(venue.id)} disabled={loading}>
                {loading ? 'Saving…' : 'Save contact'}
              </button>
              <button
                onClick={() => {
                  setAddingContactForVenueId(null)
                  setContactForm(blankContact)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setAddingContactForVenueId(venue.id)
              setContactForm(blankContact)
            }}
            style={{ fontSize: 13 }}
          >
            + Add contact
          </button>
        )}
      </div>
    )
  }

  const renderVenue = (venue: Venue) => {
    const isEditing = editingId === venue.id
    const url = mapsUrl(venue)
    const hasAddress = venue.address || venue.city

    return (
      <div
        key={venue.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          opacity: venue.is_active ? 1 : 0.6,
          background: venue.is_active ? 'white' : '#fafafa',
        }}
      >
        {isEditing ? (
          renderVenueForm(editForm, setEditForm, () => saveEdit(venue.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{venue.name}</div>
            {venue.address && (
              <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75 }}>
                {venue.address}
              </div>
            )}
            {(venue.city || venue.state || venue.zip) && (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {[venue.city, venue.state, venue.zip].filter(Boolean).join(', ')}
              </div>
            )}
            {venue.notes && (
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.65, fontStyle: 'italic' }}>
                {venue.notes}
              </div>
            )}
            {!venue.is_active && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>Inactive</div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {hasAddress && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#0070f3' }}
                >
                  Get directions
                </a>
              )}
              {canEdit && (
                <>
                  <button onClick={() => startEdit(venue)}>Edit</button>
                  <button onClick={() => toggleActive(venue)}>
                    {venue.is_active ? 'Mark inactive' : 'Mark active'}
                  </button>
                  {canDelete && (
                    <button onClick={() => deleteVenue(venue.id)}>Delete</button>
                  )}
                </>
              )}
            </div>
            {renderContacts(venue)}
          </>
        )}
      </div>
    )
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Venues</h3>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add a Venue</h4>
          {renderVenueForm(form, setForm, createVenue)}
        </>
      )}

      {isOwner && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => {
              setShowLibrary(!showLibrary)
              if (!showLibrary) loadLibrary()
            }}
            style={{ fontSize: 13 }}
          >
            {showLibrary ? 'Hide venue library' : 'Search my venue library'}
          </button>

          {showLibrary && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                background: '#fafafa',
                maxWidth: 560,
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.75 }}>
                Venues you have created across all your projects. Click "Add to this project" to reuse one here.
              </p>
              <input
                placeholder="Search by name or city…"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                style={{ padding: 8, width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
              />
              {filteredLibrary.length === 0 ? (
                <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
                  {libraryVenues.length === 0
                    ? 'No venues from other projects yet.'
                    : 'No matches found.'}
                </p>
              ) : (
                filteredLibrary.map((v) => {
                  const already = alreadyInProject.has(v.name.toLowerCase())
                  return (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: '1px solid #eee',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</div>
                        <div style={{ fontSize: 13, opacity: 0.7 }}>
                          {[v.address, v.city, v.state].filter(Boolean).join(', ')}
                        </div>
                      </div>
                      {already ? (
                        <span style={{ fontSize: 12, opacity: 0.5 }}>Already added</span>
                      ) : (
                        <button
                          onClick={() => addFromLibrary(v)}
                          disabled={loading}
                          style={{ fontSize: 13, flexShrink: 0 }}
                        >
                          Add to this project
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ opacity: 0.8 }}>No venues yet — add your first one above.</p>
        )}

        {active.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Active</h4>
            {active.map((v) => renderVenue(v))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, marginTop: 20 }}>Inactive</h4>
            {inactive.map((v) => renderVenue(v))}
          </>
        )}
      </div>
    </section>
  )
}
