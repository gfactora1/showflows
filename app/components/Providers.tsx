'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Provider = {
  id: string
  project_id: string
  name: string
  provider_type: string
  is_active: boolean
  created_at: string
}

type Props = {
  projectId: string
  myRole: Role | null
}

const PROVIDER_TYPES = ['sound', 'lighting', 'staging', 'backline', 'av', 'other']

const blank = {
  name: '',
  provider_type: 'sound',
}

export default function Providers({ projectId, myRole }: Props) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(blank)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadProviders = async () => {
    const { data, error } = await supabase
      .from('providers')
      .select('id,project_id,name,provider_type,is_active,created_at')
      .eq('project_id', projectId)
      .order('provider_type', { ascending: true })

    if (error) {
      setMsg(`Error loading providers: ${error.message}`)
      return
    }

    setProviders((data ?? []) as Provider[])
  }

  useEffect(() => {
    loadProviders()
  }, [projectId])

  const createProvider = async () => {
    setMsg('')
    if (!form.name.trim()) return setMsg('Provider name is required.')

    setLoading(true)
    try {
      const { error } = await supabase.from('providers').insert({
        project_id: projectId,
        name: form.name.trim(),
        provider_type: form.provider_type,
        is_active: true,
      })

      if (error) throw error

      setForm(blank)
      await loadProviders()
    } catch (e: any) {
      setMsg(`Error adding provider: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (provider: Provider) => {
    setEditingId(provider.id)
    setEditForm({
      name: provider.name,
      provider_type: provider.provider_type,
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
    if (!editForm.name.trim()) return setMsg('Provider name is required.')

    setLoading(true)
    try {
      const { error } = await supabase
        .from('providers')
        .update({
          name: editForm.name.trim(),
          provider_type: editForm.provider_type,
        })
        .eq('id', id)

      if (error) throw error

      setEditingId(null)
      setEditForm(blank)
      await loadProviders()
    } catch (e: any) {
      setMsg(`Error saving: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (provider: Provider) => {
    const { error } = await supabase
      .from('providers')
      .update({ is_active: !provider.is_active })
      .eq('id', provider.id)

    if (error) {
      setMsg(`Error updating: ${error.message}`)
      return
    }

    await loadProviders()
  }

  const deleteProvider = async (id: string) => {
    if (!confirm('Delete this provider? This cannot be undone.')) return
    setMsg('')

    const { error } = await supabase.from('providers').delete().eq('id', id)
    if (error) {
      setMsg(`Error deleting provider: ${error.message}`)
      return
    }

    await loadProviders()
  }

  const active = providers.filter((p) => p.is_active)
  const inactive = providers.filter((p) => !p.is_active)

  const renderTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  const renderForm = (
    values: typeof blank,
    set: (v: typeof blank) => void,
    onSubmit: () => void,
    onCancel?: () => void,
    submitLabel = 'Add Provider'
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
      <input
        placeholder="Provider name (e.g. Acme Sound Co.)"
        value={values.name}
        onChange={(e) => set({ ...values, name: e.target.value })}
        style={{ padding: 8 }}
      />
      <select
        value={values.provider_type}
        onChange={(e) => set({ ...values, provider_type: e.target.value })}
        style={{ padding: 8 }}
      >
        {PROVIDER_TYPES.map((t) => (
          <option key={t} value={t}>
            {renderTypeLabel(t)}
          </option>
        ))}
      </select>
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

  const renderProvider = (provider: Provider) => {
    const isEditing = editingId === provider.id
    return (
      <div
        key={provider.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          opacity: provider.is_active ? 1 : 0.6,
          background: provider.is_active ? 'white' : '#fafafa',
        }}
      >
        {isEditing ? (
          renderForm(editForm, setEditForm, () => saveEdit(provider.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{provider.name}</div>
            <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75 }}>
              {renderTypeLabel(provider.provider_type)}
            </div>
            {!provider.is_active && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>Inactive</div>
            )}
            {canEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(provider)}>Edit</button>
                <button onClick={() => toggleActive(provider)}>
                  {provider.is_active ? 'Mark inactive' : 'Mark active'}
                </button>
                {canDelete && (
                  <button onClick={() => deleteProvider(provider.id)}>Delete</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Providers</h3>

      {canEdit && (
        <>
          <h4 style={{ marginBottom: 8 }}>Add a Provider</h4>
          {renderForm(form, setForm, createProvider)}
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ opacity: 0.8 }}>No providers yet — add your first one above.</p>
        )}

        {active.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Active</h4>
            {active.map((p) => renderProvider(p))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, marginTop: 20 }}>Inactive</h4>
            {inactive.map((p) => renderProvider(p))}
          </>
        )}
      </div>
    </section>
  )
}