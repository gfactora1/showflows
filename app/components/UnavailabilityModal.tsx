'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

type UnavailabilityBlock = {
  id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

type Props = {
  projectId: string
  personId: string
  personName: string
  canManage: boolean
  onClose: () => void
}

const blankForm = {
  start_date: '',
  end_date: '',
  full_day: true,
  start_time: '',
  end_time: '',
  note: '',
}

export default function UnavailabilityModal({ projectId, personId, personName, canManage, onClose }: Props) {
  const [blocks, setBlocks] = useState<UnavailabilityBlock[]>([])
  const [form, setForm] = useState(blankForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const loadBlocks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('member_unavailability')
      .select('id, start_date, end_date, start_time, end_time, note')
      .eq('people_id', personId)
      .order('start_date', { ascending: true })

    setLoading(false)
    if (error) {
      setMsg(`Error loading availability: ${error.message}`)
      return
    }
    setBlocks((data ?? []) as UnavailabilityBlock[])
  }

  useEffect(() => {
    loadBlocks()
  }, [personId])

  const validate = () => {
    if (!form.start_date) return 'Start date is required.'
    if (!form.end_date) return 'End date is required.'
    if (form.end_date < form.start_date) return 'End date must be on or after start date.'
    if (!form.full_day) {
      if (!form.start_time) return 'Start time is required when not a full day block.'
      if (!form.end_time) return 'End time is required when not a full day block.'
      if (form.end_time <= form.start_time) return 'End time must be after start time.'
    }
    return null
  }

  const saveBlock = async () => {
    setMsg('')
    const err = validate()
    if (err) { setMsg(err); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in.')

      const { error } = await supabase.from('member_unavailability').insert({
        people_id: personId,
        created_by_user_id: user.id,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.full_day ? null : form.start_time || null,
        end_time: form.full_day ? null : form.end_time || null,
        note: form.note.trim() || null,
      })

      if (error) throw error

      // Fire conflict notification in background — don't block the UI
      fetch(`/api/projects/${projectId}/notify-availability-conflict`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peopleId: personId,
          startDate: form.start_date,
          endDate: form.end_date,
          startTime: form.full_day ? null : form.start_time || null,
          endTime: form.full_day ? null : form.end_time || null,
          note: form.note.trim() || null,
          triggeredByUserId: user.id,
        }),
      }).catch((e) => console.error('Notification error:', e))

      setForm(blankForm)
      await loadBlocks()
    } catch (e: any) {
      setMsg(`Error saving: ${e?.message ?? String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const deleteBlock = async (id: string) => {
    if (!confirm('Remove this unavailability block?')) return
    setMsg('')

    const { error } = await supabase
      .from('member_unavailability')
      .delete()
      .eq('id', id)

    if (error) {
      setMsg(`Error removing block: ${error.message}`)
      return
    }

    await loadBlocks()
  }

  const formatDateRange = (block: UnavailabilityBlock) => {
    const start = new Date(block.start_date + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    const end = new Date(block.end_date + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    const dateStr = start === end ? start : `${start} — ${end}`

    if (block.start_time && block.end_time) {
      const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        const ampm = h >= 12 ? 'pm' : 'am'
        const hour = h % 12 || 12
        return `${hour}:${String(m).padStart(2, '0')}${ampm}`
      }
      return `${dateStr}, ${fmt(block.start_time)} – ${fmt(block.end_time)}`
    }

    return `${dateStr} (full day)`
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  }

  const modalStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    display: 'block',
    color: '#444',
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Availability</h3>
            <div style={{ fontSize: 14, color: '#666', marginTop: 3 }}>{personName}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888', padding: 0 }}
          >
            ✕
          </button>
        </div>

        {canManage && (
          <div style={{ marginBottom: 24, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Unavailability Block</div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ ...fieldStyle, flex: 1 }}>
                <label style={labelStyle}>Start date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ ...fieldStyle, flex: 1 }}>
                <label style={labelStyle}>End date</label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="full_day"
                checked={form.full_day}
                onChange={(e) => setForm({ ...form, full_day: e.target.checked, start_time: '', end_time: '' })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="full_day" style={{ fontSize: 14, cursor: 'pointer', color: '#333' }}>
                Full day block
              </label>
            </div>

            {!form.full_day && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ ...fieldStyle, flex: 1 }}>
                  <label style={labelStyle}>Unavailable from</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ ...fieldStyle, flex: 1 }}>
                  <label style={labelStyle}>Unavailable until</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div style={{ ...fieldStyle, marginBottom: 14 }}>
              <label style={labelStyle}>Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Out of town, prior commitment"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
              />
            </div>

            {msg && (
              <div style={{ fontSize: 13, color: '#c00', marginBottom: 10 }}>{msg}</div>
            )}

            <button
              onClick={saveBlock}
              disabled={saving}
              style={{
                padding: '9px 18px',
                background: saving ? '#999' : '#111',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {saving ? 'Saving…' : 'Save Block'}
            </button>
          </div>
        )}

        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Unavailability Blocks
          </div>

          {loading && (
            <p style={{ fontSize: 13, color: '#888' }}>Loading…</p>
          )}

          {!loading && blocks.length === 0 && (
            <p style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>
              No blocks set — {personName} is currently available for all dates.
            </p>
          )}

          {blocks.map((block) => (
            <div
              key={block.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '10px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: 8,
                marginBottom: 8,
                background: 'white',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
                  {formatDateRange(block)}
                </div>
                {block.note && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{block.note}</div>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => deleteBlock(block.id)}
                  style={{
                    background: 'none',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#c00',
                    cursor: 'pointer',
                    marginLeft: 12,
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
