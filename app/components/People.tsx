'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import UnavailabilityModal from './UnavailabilityModal'
import { colors, radius, font, transition } from './tokens'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Person = {
  id: string
  project_id: string
  display_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

type Props = {
  projectId: string
  myRole: Role | null
}

const blank = {
  display_name: '',
  email: '',
  phone: '',
}

export default function People({ projectId, myRole }: Props) {
  const [people, setPeople]                         = useState<Person[]>([])
  const [form, setForm]                             = useState(blank)
  const [editingId, setEditingId]                   = useState<string | null>(null)
  const [editForm, setEditForm]                     = useState(blank)
  const [loading, setLoading]                       = useState(false)
  const [msg, setMsg]                               = useState('')
  const [availabilityPerson, setAvailabilityPerson] = useState<Person | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const canEdit               = myRole === 'owner' || myRole === 'editor'
  const canDelete             = myRole === 'owner'
  const canManageAvailability = myRole === 'owner'

  const loadPeople = async () => {
    const { data, error } = await supabase
      .from('people')
      .select('id,project_id,display_name,email,phone,is_active,notes,created_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('display_name', { ascending: true })

    if (error) { setMsg(`Error loading people: ${error.message}`); return }
    setPeople((data ?? []) as Person[])
  }

  useEffect(() => { loadPeople() }, [projectId])

  const createPerson = async () => {
    setMsg('')
    if (!form.display_name.trim()) return setMsg('Name is required.')
    setLoading(true)
    try {
      const { error } = await supabase.from('people').insert({
        project_id: projectId,
        display_name: form.display_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_active: true,
      })
      if (error) throw error
      setForm(blank)
      await loadPeople()
    } catch (e: any) {
      setMsg(`Error adding person: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (person: Person) => {
    setEditingId(person.id)
    setEditForm({ display_name: person.display_name, email: person.email ?? '', phone: person.phone ?? '' })
    setMsg('')
  }

  const cancelEdit = () => { setEditingId(null); setEditForm(blank); setMsg('') }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.display_name.trim()) return setMsg('Name is required.')
    setLoading(true)
    try {
      const { error } = await supabase
        .from('people')
        .update({
          display_name: editForm.display_name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
        })
        .eq('id', id)
      if (error) throw error
      setEditingId(null)
      setEditForm(blank)
      await loadPeople()
    } catch (e: any) {
      setMsg(`Error saving: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (person: Person) => {
    const { error } = await supabase
      .from('people')
      .update({ is_active: !person.is_active })
      .eq('id', person.id)
    if (error) setMsg(`Error updating: ${error.message}`)
    else await loadPeople()
  }

  const deletePerson = async (id: string) => {
    setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('people').update({
      deleted_at: now.toISOString(),
      deleted_by: user?.id ?? null,
      purge_after: purgeAfter.toISOString(),
    }).eq('id', id)
    if (error) setMsg(`Error removing person: ${error.message}`)
    else await loadPeople()
  }

  const active   = people.filter((p) => p.is_active)
  const inactive = people.filter((p) => !p.is_active)

  // ── Add / Edit form ───────────────────────────────────────

  const renderForm = (
    values: typeof blank,
    set: (v: typeof blank) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Add Person'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
      <input
        placeholder="Name (e.g. John Smith)"
        value={values.display_name}
        onChange={(e) => set({ ...values, display_name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className="input-field"
        style={{ fontFamily: font.sans }}
      />
      <input
        placeholder="Email (optional)"
        type="email"
        value={values.email}
        onChange={(e) => set({ ...values, email: e.target.value })}
        className="input-field"
        style={{ fontFamily: font.sans }}
      />
      <input
        placeholder="Phone (optional)"
        value={values.phone}
        onChange={(e) => set({ ...values, phone: e.target.value })}
        className="input-field"
        style={{ fontFamily: font.sans }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="btn-primary"
          style={{ fontFamily: font.sans }}
        >
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary"
            style={{ fontFamily: font.sans }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )

  // ── Person card ───────────────────────────────────────────

  const renderPerson = (person: Person) => {
    const isEditing = editingId === person.id
    return (
      <div
        key={person.id}
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          marginBottom: 8,
          opacity: person.is_active ? 1 : 0.55,
          fontFamily: font.sans,
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(person.id), cancelEdit, 'Save')
        ) : (
          <>
            {/* Name + inactive badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>
                {person.display_name}
              </span>
              {!person.is_active && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.textMuted,
                  background: colors.elevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.full,
                  padding: '1px 8px',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                }}>
                  Inactive
                </span>
              )}
            </div>

            {/* Contact info */}
            {person.email && (
              <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                {person.email}
              </div>
            )}
            {person.phone && (
              <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
                {person.phone}
              </div>
            )}

            {/* Action buttons */}
            {(canEdit || canManageAvailability) && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canEdit && (
                  <>
                    <button
                      onClick={() => startEdit(person)}
                      className="btn-secondary"
                      style={{ fontFamily: font.sans, fontSize: 12, padding: '4px 10px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(person)}
                      className="btn-secondary"
                      style={{ fontFamily: font.sans, fontSize: 12, padding: '4px 10px' }}
                    >
                      {person.is_active ? 'Mark inactive' : 'Mark active'}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setPendingDelete({ id: person.id, name: person.display_name })}
                        className="btn-link-danger"
                        style={{ fontFamily: font.sans, fontSize: 12, padding: '4px 10px' }}
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
                {canManageAvailability && (
                  <button
                    onClick={() => setAvailabilityPerson(person)}
                    style={{
                      fontFamily: font.sans,
                      fontSize: 12,
                      padding: '4px 10px',
                      background: 'transparent',
                      border: `1px solid ${colors.borderStrong}`,
                      borderRadius: radius.md,
                      color: colors.textSecondary,
                      cursor: 'pointer',
                      transition: transition.normal,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.elevated
                      e.currentTarget.style.color = colors.textPrimary
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = colors.textSecondary
                    }}
                  >
                    📅 Availability
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        People
      </h3>

      {/* Add person form */}
      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: colors.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
          }}>
            Add a Person
          </div>
          {renderForm(form, setForm, createPerson)}
        </div>
      )}

      {msg && (
        <p style={{ fontSize: 13, color: colors.red, marginBottom: 12 }}>{msg}</p>
      )}

      {/* People lists */}
      <div>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ fontSize: 13, color: colors.textMuted }}>
            No people yet — add your first one above.
          </p>
        )}

        {active.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
            }}>
              Active
            </div>
            {active.map((p) => renderPerson(p))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 8,
            }}>
              Inactive
            </div>
            {inactive.map((p) => renderPerson(p))}
          </>
        )}
      </div>

      {availabilityPerson && (
        <UnavailabilityModal
          projectId={projectId}
          personId={availabilityPerson.id}
          personName={availabilityPerson.display_name}
          canManage={canManageAvailability}
          onClose={() => setAvailabilityPerson(null)}
        />
      )}
      {pendingDelete && (
        <>
          <div onClick={() => setPendingDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: '28px 28px 24px', width: 'min(420px, calc(100vw - 32px))', zIndex: 1001, fontFamily: font.sans }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>Remove &ldquo;{pendingDelete.name}&rdquo;?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary }}>This will remove the person from this project. Past show assignments may still reference them.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDelete(null)} className="btn-secondary" style={{ fontFamily: font.sans }}>Cancel</button>
              <button
                onClick={() => { deletePerson(pendingDelete.id); setPendingDelete(null) }}
                style={{ fontFamily: font.sans, padding: '8px 18px', background: colors.red, color: 'white', border: 'none', borderRadius: radius.md, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >Remove Person</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
