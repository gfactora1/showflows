'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

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

const blankVenue = { name: '', address: '', city: '', state: '', zip: '', notes: '' }
const blankContact = { name: '', phone: '', email: '', contact_type: 'general', notes: '' }

function mapsUrl(venue: Venue) {
  const parts = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

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
  boxSizing: 'border-box',
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
  border: `1px solid rgba(252,129,129,0.35)`,
  borderRadius: radius.sm,
  color: colors.red,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: colors.textMuted,
  marginBottom: 8,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Venues({ projectId, myRole }: Props) {
  const [venues, setVenues]           = useState<Venue[]>([])
  const [libraryVenues, setLibraryVenues] = useState<Venue[]>([])
  const [contacts, setContacts]       = useState<Record<string, VenueContact[]>>({})
  const [form, setForm]               = useState(blankVenue)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editForm, setEditForm]       = useState(blankVenue)
  const [addingContactForVenueId, setAddingContactForVenueId] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState(blankContact)
  const [librarySearch, setLibrarySearch] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [msg, setMsg]                 = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [pendingDeleteContact, setPendingDeleteContact] = useState<{ id: string; name: string } | null>(null)

  const isOwner  = myRole === 'owner'
  const canEdit  = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadVenues = async () => {
    const { data, error } = await supabase
      .from('venues')
      .select('id,project_id,name,address,city,state,zip,notes,is_active,created_by_user_id')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
    if (error) { setMsg(`Error loading venues: ${error.message}`); return }
    const list = (data ?? []) as Venue[]
    setVenues(list)
    if (isOwner && list.length > 0) await loadContacts(list.map((v) => v.id))
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
    if (!form.name.trim())    return setMsg('Venue name is required.')
    if (!form.address.trim()) return setMsg('Address is required.')
    if (!form.city.trim())    return setMsg('City is required.')
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('venues').insert({
        project_id: projectId,
        name: form.name.trim(), address: form.address.trim() || null,
        city: form.city.trim() || null, state: form.state.trim() || null,
        zip: form.zip.trim() || null, notes: form.notes.trim() || null,
        is_active: true, created_by_user_id: userData?.user?.id ?? null,
      })
      if (error) throw error
      setForm(blankVenue)
      await loadVenues()
      if (isOwner) await loadLibrary()
    } catch (e: any) {
      setMsg(`Error adding venue: ${e?.message ?? String(e)}`)
    } finally { setLoading(false) }
  }

  const addFromLibrary = async (venue: Venue) => {
    setMsg('')
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('venues').insert({
        project_id: projectId,
        name: venue.name, address: venue.address, city: venue.city,
        state: venue.state, zip: venue.zip, notes: venue.notes,
        is_active: true, created_by_user_id: userData?.user?.id ?? null,
      })
      if (error) throw error
      setShowLibrary(false)
      setLibrarySearch('')
      await loadVenues()
      await loadLibrary()
    } catch (e: any) {
      setMsg(`Error adding from library: ${e?.message ?? String(e)}`)
    } finally { setLoading(false) }
  }

  const startEdit = (venue: Venue) => {
    setEditingId(venue.id)
    setEditForm({ name: venue.name, address: venue.address ?? '', city: venue.city ?? '',
      state: venue.state ?? '', zip: venue.zip ?? '', notes: venue.notes ?? '' })
    setMsg('')
  }
  const cancelEdit = () => { setEditingId(null); setEditForm(blankVenue); setMsg('') }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.name.trim())    return setMsg('Venue name is required.')
    if (!editForm.address.trim()) return setMsg('Address is required.')
    if (!editForm.city.trim())    return setMsg('City is required.')
    setLoading(true)
    try {
      const { error } = await supabase.from('venues').update({
        name: editForm.name.trim(), address: editForm.address.trim() || null,
        city: editForm.city.trim() || null, state: editForm.state.trim() || null,
        zip: editForm.zip.trim() || null, notes: editForm.notes.trim() || null,
      }).eq('id', id)
      if (error) throw error
      setEditingId(null)
      setEditForm(blankVenue)
      await loadVenues()
    } catch (e: any) {
      setMsg(`Error saving venue: ${e?.message ?? String(e)}`)
    } finally { setLoading(false) }
  }

  const toggleActive = async (venue: Venue) => {
    const { error } = await supabase.from('venues').update({ is_active: !venue.is_active }).eq('id', venue.id)
    if (error) setMsg(`Error updating: ${error.message}`)
    else await loadVenues()
  }

  const deleteVenue = async (id: string) => {
    setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('venues').update({
      deleted_at: now.toISOString(),
      deleted_by: user?.id ?? null,
      purge_after: purgeAfter.toISOString(),
    }).eq('id', id)
    if (error) setMsg(`Error deleting venue: ${error.message}`)
    else { await loadVenues(); if (isOwner) await loadLibrary() }
  }

  const addContact = async (venueId: string) => {
    setMsg('')
    if (!contactForm.name.trim()) return setMsg('Contact name is required.')
    setLoading(true)
    try {
      const { error } = await supabase.from('venue_contacts').insert({
        venue_id: venueId, project_id: projectId,
        name: contactForm.name.trim(), phone: contactForm.phone.trim() || null,
        email: contactForm.email.trim() || null, contact_type: contactForm.contact_type,
        notes: contactForm.notes.trim() || null,
      })
      if (error) throw error
      setAddingContactForVenueId(null)
      setContactForm(blankContact)
      await loadContacts(venues.map((v) => v.id))
    } catch (e: any) {
      setMsg(`Error adding contact: ${e?.message ?? String(e)}`)
    } finally { setLoading(false) }
  }

  const deleteContact = async (contactId: string) => {
    const { error } = await supabase.from('venue_contacts').delete().eq('id', contactId)
    if (error) setMsg(`Error removing contact: ${error.message}`)
    else await loadContacts(venues.map((v) => v.id))
  }

  const active   = venues.filter((v) =>  v.is_active)
  const inactive = venues.filter((v) => !v.is_active)
  const filteredLibrary = libraryVenues.filter((v) =>
    librarySearch.trim() === '' ||
    v.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
    (v.city ?? '').toLowerCase().includes(librarySearch.toLowerCase())
  )
  const alreadyInProject = new Set(venues.map((v) => v.name.toLowerCase()))

  // ── Venue form ────────────────────────────────────────────────────────────

  const renderVenueForm = (
    values: typeof blankVenue,
    set: (v: typeof blankVenue) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Add Venue'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
      <input placeholder="Venue name (e.g. The Chance Theater)" value={values.name}
        onChange={(e) => set({ ...values, name: e.target.value })} style={inputStyle} />
      <input placeholder="Street address" value={values.address}
        onChange={(e) => set({ ...values, address: e.target.value })} style={inputStyle} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="City" value={values.city}
          onChange={(e) => set({ ...values, city: e.target.value })}
          style={{ ...inputStyle, flex: 2 }} />
        <input placeholder="State" value={values.state}
          onChange={(e) => set({ ...values, state: e.target.value })}
          style={{ ...inputStyle, flex: 1 }} />
        <input placeholder="Zip" value={values.zip}
          onChange={(e) => set({ ...values, zip: e.target.value })}
          style={{ ...inputStyle, flex: 1 }} />
      </div>
      <input placeholder="Notes (optional — parking, load-in door, etc.)" value={values.notes}
        onChange={(e) => set({ ...values, notes: e.target.value })} style={inputStyle} />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onSubmit} disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && <button onClick={onCancel} disabled={loading} style={btnGhost}>Cancel</button>}
      </div>
    </div>
  )

  // ── Contacts section (owner only) ─────────────────────────────────────────

  const renderContacts = (venue: Venue) => {
    if (!isOwner) return null
    const venueContacts = contacts[venue.id] ?? []
    const isAdding = addingContactForVenueId === venue.id

    return (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ ...sectionLabel, marginBottom: 10 }}>Contacts (owner only)</div>

        {venueContacts.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {venueContacts.map((c) => (
              <div key={c.id} style={{
                fontSize: 12,
                padding: '8px 10px',
                background: colors.elevated,
                borderRadius: radius.sm,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>{c.name}</span>
                  <span style={{ color: colors.textMuted, marginLeft: 6 }}>({c.contact_type})</span>
                  {c.phone && <div style={{ color: colors.textSecondary, marginTop: 2 }}>{c.phone}</div>}
                  {c.email && <div style={{ color: colors.textSecondary }}>{c.email}</div>}
                  {c.notes && <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>{c.notes}</div>}
                </div>
                <button onClick={() => setPendingDeleteContact({ id: c.id, name: c.name })} style={btnDanger}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {isAdding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
            <input placeholder="Contact name" value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              style={{ ...inputStyle, fontSize: 12 }} />
            <select value={contactForm.contact_type}
              onChange={(e) => setContactForm({ ...contactForm, contact_type: e.target.value })}
              style={{ ...selectStyle, fontSize: 12 }}>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <input placeholder="Phone (optional)" value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              style={{ ...inputStyle, fontSize: 12 }} />
            <input placeholder="Email (optional)" value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              style={{ ...inputStyle, fontSize: 12 }} />
            <input placeholder="Notes (optional)" value={contactForm.notes}
              onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              style={{ ...inputStyle, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => addContact(venue.id)} disabled={loading}
                style={{ ...btnPrimary, fontSize: 12, padding: '5px 12px' }}>
                {loading ? 'Saving…' : 'Save contact'}
              </button>
              <button onClick={() => { setAddingContactForVenueId(null); setContactForm(blankContact) }}
                style={btnGhost}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAddingContactForVenueId(venue.id); setContactForm(blankContact) }}
            style={{ ...btnGhost, fontSize: 12 }}>
            + Add contact
          </button>
        )}
      </div>
    )
  }

  // ── Venue card ─────────────────────────────────────────────────────────────

  const renderVenue = (venue: Venue) => {
    const isEditing = editingId === venue.id
    const hasAddress = venue.address || venue.city

    return (
      <div key={venue.id} style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: '14px 16px',
        marginBottom: 8,
        opacity: venue.is_active ? 1 : 0.6,
        transition: `opacity ${transition.normal}`,
      }}>
        {isEditing ? (
          renderVenueForm(editForm, setEditForm, () => saveEdit(venue.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>
                  {venue.name}
                  {!venue.is_active && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: colors.textMuted, background: colors.elevated,
                      padding: '2px 6px', borderRadius: radius.sm,
                    }}>Inactive</span>
                  )}
                </div>
                {venue.address && (
                  <div style={{ marginTop: 3, fontSize: 12, color: colors.textSecondary }}>
                    {venue.address}
                  </div>
                )}
                {(venue.city || venue.state || venue.zip) && (
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {[venue.city, venue.state, venue.zip].filter(Boolean).join(', ')}
                  </div>
                )}
                {venue.notes && (
                  <div style={{ marginTop: 4, fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                    {venue.notes}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  {hasAddress && (
                    <a href={mapsUrl(venue)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: colors.blue, textDecoration: 'none', padding: '5px 0' }}>
                      Directions →
                    </a>
                  )}
                  <button onClick={() => startEdit(venue)} style={btnGhost}>Edit</button>
                  <button onClick={() => toggleActive(venue)} style={btnGhost}>
                    {venue.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {canDelete && (
                    <button onClick={() => setPendingDelete({ id: venue.id, name: venue.name })} style={btnDanger}>Delete</button>
                  )}
                </div>
              )}
            </div>

            {renderContacts(venue)}
          </>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Venues
      </h3>

      {/* Add venue form */}
      {canEdit && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: radius.lg, padding: 16, marginBottom: 28,
        }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Add a Venue</div>
          {renderVenueForm(form, setForm, createVenue)}
        </div>
      )}

      {/* Venue library (owner only) */}
      {isOwner && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => { setShowLibrary(!showLibrary); if (!showLibrary) loadLibrary() }}
            style={btnGhost}
          >
            {showLibrary ? 'Hide venue library ▲' : 'Search my venue library ▼'}
          </button>

          {showLibrary && (
            <div style={{
              marginTop: 10,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              padding: 14,
              maxWidth: 560,
            }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
                Venues you've created across all your projects. Click "Add" to reuse one here.
              </p>
              <input
                placeholder="Search by name or city…"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              {filteredLibrary.length === 0 ? (
                <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
                  {libraryVenues.length === 0 ? 'No venues from other projects yet.' : 'No matches found.'}
                </p>
              ) : (
                filteredLibrary.map((v) => {
                  const already = alreadyInProject.has(v.name.toLowerCase())
                  return (
                    <div key={v.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: `1px solid ${colors.border}`,
                      gap: 8,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>{v.name}</div>
                        <div style={{ fontSize: 12, color: colors.textMuted }}>
                          {[v.address, v.city, v.state].filter(Boolean).join(', ')}
                        </div>
                      </div>
                      {already ? (
                        <span style={{ fontSize: 11, color: colors.textMuted }}>Already added</span>
                      ) : (
                        <button onClick={() => addFromLibrary(v)} disabled={loading}
                          style={{ ...btnGhost, fontSize: 12 }}>
                          Add
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

      {msg && <p style={{ color: colors.red, fontSize: 13, marginBottom: 16 }}>{msg}</p>}

      {/* Venue lists */}
      <div>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ fontSize: 13, color: colors.textMuted }}>No venues yet — add your first one above.</p>
        )}

        {active.length > 0 && (
          <>
            <div style={sectionLabel}>Active — {active.length}</div>
            {active.map((v) => renderVenue(v))}
          </>
        )}

        {inactive.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={sectionLabel}>Inactive — {inactive.length}</div>
            {inactive.map((v) => renderVenue(v))}
          </div>
        )}
      </div>
      {pendingDeleteContact && (
        <>
          <div onClick={() => setPendingDeleteContact(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: '24px 24px 20px', width: 'min(380px, calc(100vw - 32px))', zIndex: 1001, fontFamily: font.sans }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Remove &ldquo;{pendingDeleteContact.name}&rdquo;?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.textSecondary }}>This will remove the contact from this venue.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDeleteContact(null)} className="btn-secondary" style={{ fontFamily: font.sans }}>Cancel</button>
              <button
                onClick={() => { deleteContact(pendingDeleteContact.id); setPendingDeleteContact(null) }}
                style={{ fontFamily: font.sans, padding: '7px 16px', background: colors.red, color: 'white', border: 'none', borderRadius: radius.md, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >Remove</button>
            </div>
          </div>
        </>
      )}
      {pendingDelete && (
        <>
          <div onClick={() => setPendingDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: '28px 28px 24px', width: 'min(420px, calc(100vw - 32px))', zIndex: 1001, fontFamily: font.sans }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>Delete &ldquo;{pendingDelete.name}&rdquo;?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary }}>This will remove the venue from this project.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDelete(null)} className="btn-secondary" style={{ fontFamily: font.sans }}>Cancel</button>
              <button
                onClick={() => { deleteVenue(pendingDelete.id); setPendingDelete(null) }}
                style={{ fontFamily: font.sans, padding: '8px 18px', background: colors.red, color: 'white', border: 'none', borderRadius: radius.md, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >Delete Venue</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
