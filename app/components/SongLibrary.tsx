'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font, transition } from './tokens'

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Song = {
  id: string
  project_id: string
  title: string
  artist: string | null
  key: string | null
  notes: string | null
  uses_backing_track: boolean
  is_active: boolean
  created_at: string
}

type Props = { projectId: string; myRole: Role | null }
type FilterMode = 'active' | 'inactive' | 'all'
type EditForm = { title: string; artist: string; key: string; notes: string; uses_backing_track: boolean }

const blankForm: EditForm = { title: '', artist: '', key: '', notes: '', uses_backing_track: false }

function parseBool(val: string): boolean {
  return ['yes', 'true', '1'].includes(val.trim().toLowerCase())
}
function isBoolish(val: string): boolean {
  return ['yes', 'no', 'true', 'false', '1', '0'].includes(val.trim().toLowerCase())
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
  boxSizing: 'border-box',
  fontFamily: font.sans,
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
  padding: '4px 10px',
  background: 'transparent',
  border: `1px solid rgba(252,129,129,0.35)`,
  borderRadius: radius.sm,
  color: colors.red,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: font.sans,
  whiteSpace: 'nowrap',
}

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  border: `1px solid ${active ? colors.violet : colors.borderStrong}`,
  borderRadius: radius.full,
  background: active ? colors.violetSoft2 : 'transparent',
  color: active ? colors.violet : colors.textMuted,
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontFamily: font.sans,
  transition: `all ${transition.normal}`,
})

export default function SongLibrary({ projectId, myRole }: Props) {
  const [songs, setSongs]               = useState<Song[]>([])
  const [loading, setLoading]           = useState(false)
  const [msg, setMsg]                   = useState('')
  const [isError, setIsError]           = useState(false)
  const [search, setSearch]             = useState('')
  const [filterMode, setFilterMode]     = useState<FilterMode>('active')
  const [showAddForm, setShowAddForm]   = useState(false)
  const [addForm, setAddForm]           = useState<EditForm>(blankForm)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<EditForm>(blankForm)
  const [saving, setSaving]             = useState(false)
  const [importing, setImporting]       = useState(false)
  const [showImportHelp, setShowImportHelp] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const canEdit  = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const showMsg = (text: string, error = false) => { setMsg(text); setIsError(error) }

  const loadSongs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_songs')
      .select('id,project_id,title,artist,key,notes,uses_backing_track,is_active,created_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('title', { ascending: true })
    setLoading(false)
    if (error) { showMsg(`Error loading songs: ${error.message}`, true); return }
    setSongs((data ?? []) as Song[])
  }, [projectId])

  useEffect(() => { loadSongs() }, [loadSongs])

  const filteredSongs = songs.filter((s) => {
    const matchesFilter = filterMode === 'all' ? true : filterMode === 'active' ? s.is_active : !s.is_active
    const q = search.toLowerCase()
    const matchesSearch = !search || s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  const addSong = async () => {
    if (!addForm.title.trim()) { showMsg('Song title is required.', true); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.from('project_songs').insert({
      project_id: projectId,
      title: addForm.title.trim(),
      artist: addForm.artist.trim() || null,
      key: addForm.key.trim() || null,
      notes: addForm.notes.trim() || null,
      uses_backing_track: addForm.uses_backing_track,
      is_active: true,
    })
    setSaving(false)
    if (error) { showMsg(`Error adding song: ${error.message}`, true); return }
    setAddForm(blankForm); setShowAddForm(false); showMsg('Song added.')
    await loadSongs()
  }

  const startEdit = (song: Song) => {
    setEditingId(song.id)
    setEditForm({ title: song.title, artist: song.artist ?? '', key: song.key ?? '', notes: song.notes ?? '', uses_backing_track: song.uses_backing_track })
    setMsg('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editForm.title.trim()) { showMsg('Song title is required.', true); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.from('project_songs').update({
      title: editForm.title.trim(), artist: editForm.artist.trim() || null,
      key: editForm.key.trim() || null, notes: editForm.notes.trim() || null,
      uses_backing_track: editForm.uses_backing_track,
    }).eq('id', editingId)
    setSaving(false)
    if (error) { showMsg(`Error saving: ${error.message}`, true); return }
    setEditingId(null); setEditForm(blankForm); await loadSongs()
  }

  const toggleActive = async (song: Song) => {
    const { error } = await supabase.from('project_songs').update({ is_active: !song.is_active }).eq('id', song.id)
    if (error) { showMsg(`Error updating: ${error.message}`, true); return }
    await loadSongs()
  }

  const deleteSong = async (id: string) => {
    setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('project_songs').update({
      deleted_at: now.toISOString(),
      deleted_by: user?.id ?? null,
      purge_after: purgeAfter.toISOString(),
    }).eq('id', id)
    if (error) { showMsg(`Error deleting: ${error.message}`, true); return }
    await loadSongs()
  }

  const exportCSV = () => {
    const headers = ['title', 'artist', 'key', 'notes', 'uses_backing_track', 'is_active']
    const rows = songs.map((s) => [
      `"${(s.title ?? '').replace(/"/g, '""')}"`,
      `"${(s.artist ?? '').replace(/"/g, '""')}"`,
      `"${(s.key ?? '').replace(/"/g, '""')}"`,
      `"${(s.notes ?? '').replace(/"/g, '""')}"`,
      s.uses_backing_track ? 'yes' : 'no',
      s.is_active ? 'yes' : 'no',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `song-library-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true); setMsg(''); setImportResult(null)
    try {
      const text = await file.text()
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length < 2) { showMsg('CSV file appears empty or has no data rows.', true); setImporting(false); return }
      const rawHeaders = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
      const titleIdx = rawHeaders.indexOf('title')
      if (titleIdx === -1) { showMsg('CSV must have a "title" column.', true); setImporting(false); return }
      const artistIdx = rawHeaders.indexOf('artist')
      const keyIdx    = rawHeaders.indexOf('key')
      const notesIdx  = rawHeaders.indexOf('notes')
      const btIdx     = rawHeaders.indexOf('uses_backing_track')
      const activeIdx = rawHeaders.indexOf('is_active')
      const hasActiveColumn = activeIdx !== -1

      const { data: existingSongs } = await supabase.from('project_songs').select('id, title, artist, is_active').eq('project_id', projectId).is('deleted_at', null)
      const existingMap = new Map<string, { id: string; is_active: boolean }>()
      ;(existingSongs ?? []).forEach((s: any) => {
        existingMap.set(`${s.title.toLowerCase().trim()}|${(s.artist ?? '').toLowerCase().trim()}`, { id: s.id, is_active: s.is_active })
      })

      const parseRow = (line: string): string[] => {
        const result: string[] = []; let current = ''; let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++ } else inQuotes = !inQuotes }
          else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
          else current += ch
        }
        result.push(current.trim()); return result
      }

      const toInsert: any[] = []
      const toUpdate: { id: string; is_active: boolean }[] = []
      let skipped = 0

      for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i])
        const title = (cols[titleIdx] ?? '').trim()
        if (!title) continue
        const artist = artistIdx !== -1 ? (cols[artistIdx] ?? '').trim() : ''
        const dedupeKey = `${title.toLowerCase()}|${artist.toLowerCase()}`
        const existing = existingMap.get(dedupeKey)
        if (existing) {
          if (hasActiveColumn) {
            const rawActive = (cols[activeIdx] ?? '').trim()
            if (isBoolish(rawActive)) {
              const newActive = parseBool(rawActive)
              if (newActive !== existing.is_active) toUpdate.push({ id: existing.id, is_active: newActive })
              else skipped++
            } else skipped++
          } else skipped++
        } else {
          toInsert.push({
            project_id: projectId, title,
            artist: artist || null,
            key: keyIdx !== -1 ? (cols[keyIdx] ?? '').trim() || null : null,
            notes: notesIdx !== -1 ? (cols[notesIdx] ?? '').trim() || null : null,
            uses_backing_track: btIdx !== -1 && isBoolish(cols[btIdx] ?? '') ? parseBool(cols[btIdx]) : false,
            is_active: hasActiveColumn && isBoolish(cols[activeIdx] ?? '') ? parseBool(cols[activeIdx]) : true,
          })
        }
      }

      let added = 0, updated = 0
      if (toInsert.length > 0) {
        const { error } = await supabase.from('project_songs').insert(toInsert)
        if (error) throw new Error(`Import error: ${error.message}`)
        added = toInsert.length
      }
      for (const update of toUpdate) {
        const { error } = await supabase.from('project_songs').update({ is_active: update.is_active }).eq('id', update.id)
        if (!error) updated++
      }
      setImportResult({ added, updated, skipped })
      await loadSongs()
    } catch (e: any) {
      showMsg(`Import failed: ${e?.message ?? String(e)}`, true)
    } finally {
      setImporting(false)
    }
  }

  const activeCount   = songs.filter((s) =>  s.is_active).length
  const inactiveCount = songs.filter((s) => !s.is_active).length

  // ── Song form ─────────────────────────────────────────────────────────────

  const renderSongForm = (
    form: EditForm,
    setForm: (f: EditForm) => void,
    onSave: () => void,
    onCancel: () => void,
    saveLabel = 'Save'
  ) => (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderLeft: `3px solid ${colors.violet}`,
      borderRadius: radius.md,
      padding: '14px 16px',
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <input
        placeholder="Song title (required)"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        style={inputStyle}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          placeholder="Artist (optional)"
          value={form.artist}
          onChange={(e) => setForm({ ...form, artist: e.target.value })}
          style={{ ...inputStyle, flex: 2, minWidth: 160 }}
        />
        <input
          placeholder="Key (e.g. G, Am)"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
          style={{ ...inputStyle, flex: 1, minWidth: 90 }}
        />
      </div>
      <input
        placeholder="Notes (optional)"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        style={inputStyle}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          id={`bt_${saveLabel}`}
          checked={form.uses_backing_track}
          onChange={(e) => setForm({ ...form, uses_backing_track: e.target.checked })}
          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: colors.violet }}
        />
        <label htmlFor={`bt_${saveLabel}`} style={{ fontSize: 13, cursor: 'pointer', color: colors.textSecondary }}>
          Uses backing track / sampled music
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onSave} disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Song Library
      </h3>
      <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>
        {songs.length} song{songs.length !== 1 ? 's' : ''} — {activeCount} active, {inactiveCount} inactive
      </p>

      {/* CSV import callout */}
      {canEdit && (
        <div style={{
          background: colors.violetSoft,
          border: `1px solid rgba(124,58,237,0.25)`,
          borderRadius: radius.md,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            📋 <strong style={{ color: colors.textPrimary }}>Importing from a spreadsheet?</strong>{' '}
            Your CSV must have a <code style={{ background: colors.elevated, padding: '1px 5px', borderRadius: 3, fontSize: 12, color: colors.violetLight }}>title</code> column. Column names must be lowercase.
          </div>
          <button
            onClick={() => setShowImportHelp(!showImportHelp)}
            style={{ ...btnGhost, fontSize: 12, borderColor: 'rgba(124,58,237,0.4)', color: colors.violetLight }}
          >
            {showImportHelp ? 'Hide guide ▲' : 'See full guide →'}
          </button>
        </div>
      )}

      {/* CSV import guide */}
      {showImportHelp && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: 20,
          marginBottom: 20,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary, marginBottom: 12 }}>CSV Import Guide</div>
          <p style={{ marginBottom: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
            Create your song list in Excel or Google Sheets, export as <strong>.csv</strong>. First row must be column headers exactly as shown.
          </p>

          {/* Column reference table */}
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: colors.card }}>
                  {['Column', 'Required?', 'Description', 'Example'].map((h) => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: colors.textMuted, border: `1px solid ${colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['title', '✅ Yes', 'The song name', "Don't Stop Believin'"],
                  ['artist', 'No', 'Original artist or band', 'Journey'],
                  ['key', 'No', 'Musical key', 'E, Am, Bb'],
                  ['notes', 'No', 'Notes for the band', 'Capo 2, starts slow'],
                  ['uses_backing_track', 'No', 'Uses sampled/backing music?', 'yes or no'],
                  ['is_active', 'No', 'Currently in rotation?', 'yes or no'],
                ].map(([col, req, desc, ex], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, fontFamily: 'monospace', color: col === 'title' ? colors.violetLight : colors.textSecondary }}>{col}</td>
                    <td style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, color: req === '✅ Yes' ? colors.green : colors.textMuted }}>{req}</td>
                    <td style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, color: colors.textSecondary }}>{desc}</td>
                    <td style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, color: colors.textMuted, fontStyle: 'italic' }}>{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Example CSV */}
          <div style={{ background: colors.base, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted, marginBottom: 8 }}>Example CSV</div>
            <pre style={{ fontSize: 12, color: colors.textSecondary, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>{`title,artist,key,notes,uses_backing_track,is_active
Don't Stop Believin',Journey,E,Big ending,no,yes
Africa,Toto,Ab,,no,yes
September,Earth Wind & Fire,D,Horn intro,yes,yes
Uptown Funk,Bruno Mars,Dm,,yes,no`}</pre>
          </div>

          <div style={{ color: colors.textSecondary, lineHeight: 1.7, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>Good to know:</div>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li>Column names must be <strong>lowercase</strong> and spelled exactly as shown</li>
              <li>Columns you don't need can be left out entirely</li>
              <li>Titles with commas work fine — just wrap them in quotes</li>
              <li>For yes/no columns: <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>yes</code>, <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>no</code>, <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>true</code>, <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>false</code>, <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>1</code>, <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>0</code></li>
              <li>If <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>is_active</code> is omitted, all imported songs default to active</li>
              <li><strong>Re-importing:</strong> Songs are matched by title + artist. New songs are added; existing songs only update if <code style={{ background: colors.elevated, padding: '1px 4px', borderRadius: 3 }}>is_active</code> column is present</li>
            </ul>
          </div>
        </div>
      )}

      {/* Actions row */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <button onClick={() => { setShowAddForm(!showAddForm); setMsg('') }} style={btnPrimary}>
            {showAddForm ? '— Cancel' : '+ Add Song'}
          </button>
          <label style={{
            ...btnGhost,
            display: 'inline-flex', alignItems: 'center',
            cursor: importing ? 'not-allowed' : 'pointer',
            opacity: importing ? 0.6 : 1,
          }}>
            {importing ? 'Importing…' : '⬆ Import CSV'}
            <input type="file" accept=".csv" onChange={handleFileImport} style={{ display: 'none' }} disabled={importing} />
          </label>
          {songs.length > 0 && (
            <button onClick={exportCSV} style={btnGhost}>⬇ Export CSV</button>
          )}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div style={{
          background: colors.greenSoft,
          border: `1px solid rgba(34,197,94,0.25)`,
          borderRadius: radius.md,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: colors.green,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>✓ Import complete — {importResult.added} added, {importResult.updated} updated, {importResult.skipped} unchanged</span>
          <button onClick={() => setImportResult(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.green, fontSize: 13, padding: 0 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && canEdit && renderSongForm(addForm, setAddForm, addSong, () => { setShowAddForm(false); setAddForm(blankForm) }, 'Add Song')}

      {msg && (
        <p style={{ fontSize: 13, color: isError ? colors.red : colors.green, marginBottom: 12 }}>{msg}</p>
      )}

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            placeholder="Search by title or artist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingRight: search ? 32 : 11 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted,
              fontSize: 16, padding: 0, lineHeight: 1,
            }}>×</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={filterBtn(filterMode === 'active')} onClick={() => setFilterMode('active')}>
            Active ({activeCount})
          </button>
          <button style={filterBtn(filterMode === 'inactive')} onClick={() => setFilterMode('inactive')}>
            Inactive ({inactiveCount})
          </button>
          <button style={filterBtn(filterMode === 'all')} onClick={() => setFilterMode('all')}>
            All ({songs.length})
          </button>
        </div>
      </div>

      {loading && <p style={{ color: colors.textMuted, fontSize: 13 }}>Loading…</p>}

      {!loading && filteredSongs.length === 0 && (
        <p style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>
          {songs.length === 0
            ? 'No songs yet — add your first song above or import a CSV.'
            : 'No songs match your search or filter.'}
        </p>
      )}

      {/* Song list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {filteredSongs.map((song) => {
          const isEditing = editingId === song.id
          return (
            <div key={song.id} style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: '10px 14px',
              opacity: song.is_active ? 1 : 0.6,
              transition: `opacity ${transition.normal}`,
            }}>
              {isEditing ? (
                renderSongForm(editForm, setEditForm, saveEdit, () => { setEditingId(null); setEditForm(blankForm) }, 'Save')
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Song info */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary, whiteSpace: 'nowrap' }}>
                      {song.title}
                    </span>
                    {song.artist && (
                      <span style={{ fontSize: 12, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                        — {song.artist}
                      </span>
                    )}
                    {song.key && (
                      <span style={{ fontSize: 12, color: colors.textMuted, whiteSpace: 'nowrap' }}>
                        · {song.key}
                      </span>
                    )}
                    {song.uses_backing_track && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: colors.violetSoft2, color: colors.violetLight,
                        padding: '1px 6px', borderRadius: radius.sm,
                        whiteSpace: 'nowrap',
                      }}>
                        BT
                      </span>
                    )}
                    {song.notes && (
                      <span style={{
                        fontSize: 12, color: colors.textMuted, fontStyle: 'italic',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: 280,
                      }}>
                        {song.notes}
                      </span>
                    )}
                    {!song.is_active && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: colors.textMuted,
                        background: colors.elevated, padding: '1px 6px', borderRadius: radius.sm,
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Controls */}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button onClick={() => startEdit(song)} style={{ ...btnGhost, fontSize: 11, padding: '3px 9px' }}>Edit</button>
                      <button onClick={() => toggleActive(song)} style={{ ...btnGhost, fontSize: 11, padding: '3px 9px' }}>
                        {song.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {canDelete && (
                        <button onClick={() => setPendingDelete({ id: song.id, name: song.title })} style={btnDanger}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {pendingDelete && (
        <>
          <div onClick={() => setPendingDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#252638', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '28px 28px 24px', width: 'min(420px, calc(100vw - 32px))', zIndex: 1001, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#F5F7FB' }}>Delete &ldquo;{pendingDelete.name}&rdquo;?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#B8C0D6' }}>This will remove the song from the library. It will no longer appear in new setlists.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingDelete(null)} className="btn-secondary" style={{ fontFamily: 'inherit' }}>Cancel</button>
              <button
                onClick={() => { deleteSong(pendingDelete.id); setPendingDelete(null) }}
                style={{ fontFamily: 'inherit', padding: '8px 18px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >Delete Song</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
