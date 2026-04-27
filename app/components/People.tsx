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

const blank = { display_name: '', email: '', phone: '' }

// ── Shared input style ────────────────────────────────────────────────────────
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

// ── Shared button styles ──────────────────────────────────────────────────────
const btnGhost: React.CSSProperties = {
  padding: '5px 12px',
  background: 'transparent',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.sm,
  color: colors.textPrimary,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: font.sans,
  transition: `background ${transition.normal}, color ${transition.normal}`,
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
}

export default function People({ projectId, myRole }: Props) {
  const [people, setPeople]                     = useState<Person[]>([])
  const [form, setForm]                         = useState(blank)
  const [editingId, setEditingId]               = useState<string | null>(null)
  const [editForm, setEditForm]                 = useState(blank)
  const [loading, setLoading]                   = useState(false)
  const [msg, setMsg]                           = useState('')
  const [availabilityPerson, setAvailabilityPerson] = useState<Person | null>(null)

  const canEdit             = myRole === 'owner' || myRole === 'editor'
  const canDelete           = myRole === 'owner'
  const canManageAvailability = myRole === 'owner'

  const loadPeople = async () => {
    const { data, error } = await supabase
      .from('people')
      .select('id,project_id,display_name,email,phone,is_active,notes,created_at')
      .eq('project_id', projectId)
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
    setEditForm({
      display_name: person.display_name,
      email: person.email ?? '',
      phone: person.phone ?? '',
    })
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
    if (!confirm('Remove this person? This cannot be undone.')) return
    setMsg('')
    const { error } = await supabase.from('people').delete().eq('id', id)
    if (error) setMsg(`Error removing person: ${error.message}`)
    else await loadPeople()
  }

  const active   = people.filter((p) =>  p.is_active)
  const inactive = people.filter((p) => !p.is_active)

  // ── Inline form (add / edit) ────────────────────────────────────────────────
  const renderForm = (
    values: typeof blank,
    set: (v: typeof blank) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Add Person'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
      <input
        placeholder="Name (e.g. John Smith)"
        value={values.display_name}
        onChange={(e) => set({ ...values, display_name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        style={inputStyle}
      />
      <input
        placeholder="Email (optional)"
        value={values.email}
        onChange={(e) => set({ ...values, email: e.target.value })}
        style={inputStyle}
      />
      <input
        placeholder="Phone (optional)"
        value={values.phone}
        onChange={(e) => set({ ...values, phone: e.target.value })}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onSubmit}
          disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={loading} style={btnGhost}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )

  // ── Person card ─────────────────────────────────────────────────────────────
  const renderPerson = (person: Person) => {
    const isEditing = editingId === person.id
    const isInactive = !person.is_active
    return (
      <div
        key={person.id}
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '14px 16px',
          marginBottom: 8,
          background: isInactive ? colors.surface : colors.card,
          opacity: isInactive ? 0.7 : 1,
          transition: `opacity ${transition.normal}`,
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(person.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>
                  {person.display_name}
                  {isInactive && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: colors.textMuted,
                      background: colors.elevated,
                      padding: '2px 6px',
                      borderRadius: radius.sm,
                    }}>
                      Inactive
                    </span>
                  )}
                </div>
                {person.email && (
                  <div style={{ marginTop: 3, fontSize: 12, color: colors.textSecondary }}>
                    {person.email}
                  </div>
                )}
                {person.phone && (
                  <div style={{ marginTop: 2, fontSize: 12, color: colors.textSecondary }}>
                    {person.phone}
                  </div>
                )}
              </div>

              {/* Action buttons — right aligned */}
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => startEdit(person)} style={btnGhost}>
                    Edit
                  </button>
                  <button onClick={() => toggleActive(person)} style={btnGhost}>
                    {person.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {canManageAvailability && (
                    <button
                      onClick={() => setAvailabilityPerson(person)}
                      style={btnGhost}
                    >
                      📅 Availability
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => deletePerson(person.id)} style={btnDanger}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 20, color: colors.textPrimary, fontSize: 16, fontWeight: 600 }}>
        People
      </h3>

      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 28,
        }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Add a Person
          </h4>
          {renderForm(form, setForm, createPerson)}
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: colors.red }}>{msg}</p>
      )}

      <div>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ fontSize: 13, color: colors.textMuted }}>
            No people yet — add your first one above.
          </p>
        )}

        {active.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 8,
            }}>
              Active — {active.length}
            </div>
            {active.map((p) => renderPerson(p))}
          </>
        )}

        {inactive.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 8,
            }}>
              Inactive — {inactive.length}
            </div>
            {inactive.map((p) => renderPerson(p))}
          </div>
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
    </section>
  )
}
