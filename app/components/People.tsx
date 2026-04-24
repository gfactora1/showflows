'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import UnavailabilityModal from './UnavailabilityModal'

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
  const [people, setPeople] = useState<Person[]>([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(blank)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [availabilityPerson, setAvailabilityPerson] = useState<Person | null>(null)

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'
  const canManageAvailability = myRole === 'owner' || myRole === 'editor'

  const loadPeople = async () => {
    const { data, error } = await supabase
      .from('people')
      .select('id,project_id,display_name,email,phone,is_active,notes,created_at')
      .eq('project_id', projectId)
      .order('display_name', { ascending: true })

    if (error) {
      setMsg(`Error loading people: ${error.message}`)
      return
    }
    setPeople((data ?? []) as Person[])
  }

  useEffect(() => {
    loadPeople()
  }, [projectId])

  const createPerson = async () => {
    setMsg('')
    if (!form.display_name.trim()) return setMsg('Name is required.')
    if (!form.email.trim()) return setMsg('Email is required.')

    setLoading(true)
    try {
      const { error } = await supabase.from('people').insert({
        project_id: projectId,
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
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

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(blank)
    setMsg('')
  }

  const saveEdit = async (id: string) => {
    setMsg('')
    if (!editForm.display_name.trim()) return setMsg('Name is required.')
    if (!editForm.email.trim()) return setMsg('Email is required.')

    setLoading(true)
    try {
      const { error } = await supabase
        .from('people')
        .update({
          display_name: editForm.display_name.trim(),
          email: editForm.email.trim().toLowerCase(),
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

  const active = people.filter((p) => p.is_active)
  const inactive = people.filter((p) => !p.is_active)

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
        style={{ padding: 8 }}
      />
      <input
        placeholder="Email"
        type="email"
        value={values.email}
        onChange={(e) => set({ ...values, email: e.target.value })}
        style={{ padding: 8 }}
      />
      <input
        placeholder="Phone (optional)"
        value={values.phone}
        onChange={(e) => set({ ...values, phone: e.target.value })}
        style={{ padding: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onSubmit} disabled={loading}>
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={loading}>Cancel</button>
        )}
      </div>
    </div>
  )

  const renderPerson = (person: Person) => {
    const isEditing = editingId === person.id
    return (
      <div
        key={person.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          opacity: person.is_active ? 1 : 0.6,
          background: person.is_active ? 'white' : '#fafafa',
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(person.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{person.display_name}</div>
            {person.email && (
              <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75 }}>{person.email}</div>
            )}
            {person.phone && (
              <div style={{ marginTop: 2, fontSize: 13, opacity: 0.75 }}>{person.phone}</div>
            )}
            {!person.email && (
              <div style={{ marginTop: 3, fontSize: 12, color: '#c00' }}>⚠️ No email — member matching disabled</div>
            )}
            {!person.is_active && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>Inactive</div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && (
                <>
                  <button onClick={() => startEdit(person)}>Edit</button>
                  <button onClick={() => toggleActive(person)}>
                    {person.is_active ? 'Mark inactive' : 'Mark active'}
                  </button>
                  {canDelete && (
                    <button onClick={() => deletePerson(person.id)}>Remove</button>
                  )}
                </>
              )}
              {canManageAvailability && (
                <button
                  onClick={() => setAvailabilityPerson(person)}
                  style={{
                    padding: '4px 12px',
                    background: 'none',
                    border: '1px solid #bbb',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: '#444',
                  }}
                >
                  📅 Availability
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>People</h3>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add a Person</h4>
          {renderForm(form, setForm, createPerson)}
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ opacity: 0.8 }}>No people yet — add your first one above.</p>
        )}
        {active.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Active</h4>
            {active.map((p) => renderPerson(p))}
          </>
        )}
        {inactive.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, marginTop: 20 }}>Inactive</h4>
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
    </section>
  )
}
