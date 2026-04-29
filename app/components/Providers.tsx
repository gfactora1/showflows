'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font } from './tokens'

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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const loadProviders = async () => {
    const { data, error } = await supabase
      .from('providers')
      .select('id,project_id,name,provider_type,is_active,created_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
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
    setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('providers').update({
      deleted_at: now.toISOString(),
      deleted_by: user?.id ?? null,
      purge_after: purgeAfter.toISOString(),
    }).eq('id', id)
    if (error) {
      setMsg(`Error deleting provider: ${error.message}`)
      return
    }
    await loadProviders()
  }

  const active = providers.filter((p) => p.is_active)
  const inactive = providers.filter((p) => !p.is_active)

  const renderTypeLabel = (type: string) =>
    type.charAt(0).toUpperCase() + type.slice(1)

  const renderFormFields = (
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
        className="input-field"
        style={{ fontFamily: font.sans }}
      />
      <select
        value={values.provider_type}
        onChange={(e) => set({ ...values, provider_type: e.target.value })}
        className="input-select"
        style={{ fontFamily: font.sans }}
      >
        {PROVIDER_TYPES.map((t) => (
          <option key={t} value={t}>
            {renderTypeLabel(t)}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onSubmit} disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={loading} className="btn-secondary">
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
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          padding: '12px 14px',
          marginBottom: 8,
          opacity: provider.is_active ? 1 : 0.55,
          fontFamily: font.sans,
        }}
      >
        {isEditing ? (
          renderFormFields(editForm, setEditForm, () => saveEdit(provider.id), cancelEdit, 'Save')
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>
                {provider.name}
              </span>
              <span style={{
                fontSize: 11,
                color: colors.textMuted,
                background: colors.elevated,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.full,
                padding: '1px 8px',
              }}>
                {renderTypeLabel(provider.provider_type)}
              </span>
              {!provider.is_active && (
                <span style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  background: colors.elevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.full,
                  padding: '1px 8px',
                }}>
                  Inactive
                </span>
              )}
            </div>
            {canEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(provider)} className="btn-secondary" style={{ fontSize: 13, padding: '4px 12px' }}>
                  Edit
                </button>
                <button onClick={() => toggleActive(provider)} className="btn-secondary" style={{ fontSize: 13, padding: '4px 12px' }}>
                  {provider.is_active ? 'Mark inactive' : 'Mark active'}
                </button>
                {canDelete && (
                  <button onClick={() => setPendingDelete({ id: provider.id, name: provider.name })} className="btn-link-danger" style={{ fontSize: 13 }}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Providers
      </h3>

      {canEdit && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Add a Provider
          </div>
          {renderFormFields(form, setForm, createProvider)}
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: colors.red }}>
          {msg}
        </p>
      )}

      <div>
        {active.length === 0 && inactive.length === 0 && (
          <p style={{ color: colors.textMuted, fontSize: 14 }}>
            No providers yet — add your first one above.
          </p>
        )}

        {active.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Active
            </div>
            {active.map((p) => renderProvider(p))}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 20 }}>
              Inactive
            </div>
            {inactive.map((p) => renderProvider(p))}
          </>
        )}
      </div>
      {pendingDelete && (
        <>
          <div onClick={() => setPendingDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: '28px 28px 24px', width: 'min(420px, calc(100vw - 32px))', zIndex: 1001, fontFamily: font.sans }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>Delete &ldquo;{pendingDelete.name}&rdquo;?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary }}>This will remove the provider from this project.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDelete(null)} className="btn-secondary" style={{ fontFamily: font.sans }}>Cancel</button>
              <button
                onClick={() => { deleteProvider(pendingDelete.id); setPendingDelete(null) }}
                style={{ fontFamily: font.sans, padding: '8px 18px', background: colors.red, color: 'white', border: 'none', borderRadius: radius.md, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >Delete Provider</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
