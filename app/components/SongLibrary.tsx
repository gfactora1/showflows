'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'

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

type Props = {
  projectId: string
  myRole: Role | null
}

type FilterMode = 'active' | 'inactive' | 'all'

type EditForm = {
  title: string
  artist: string
  key: string
  notes: string
  uses_backing_track: boolean
}

const blankForm: EditForm = {
  title: '', artist: '', key: '', notes: '', uses_backing_track: false,
}

function parseBool(val: string): boolean {
  return ['yes', 'true', '1'].includes(val.trim().toLowerCase())
}

function isBoolish(val: string): boolean {
  return ['yes', 'no', 'true', 'false', '1', '0'].includes(val.trim().toLowerCase())
}

export default function SongLibrary({ projectId, myRole }: Props) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('active')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<EditForm>(blankForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(blankForm)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportHelp, setShowImportHelp] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)

  const canEdit = myRole === 'owner' || myRole === 'editor'
  const canDelete = myRole === 'owner'

  const showMsg = (text: string, error = false) => {
    setMsg(text); setIsError(error)
  }

  const loadSongs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_songs')
      .select('id,project_id,title,artist,key,notes,uses_backing_track,is_active,created_at')
      .eq('project_id', projectId)
      .order('title', { ascending: true })
    setLoading(false)
    if (error) { showMsg(`Error loading songs: ${error.message}`, true); return }
    setSongs((data ?? []) as Song[])
  }, [projectId])

  useEffect(() => { loadSongs() }, [loadSongs])

  const filteredSongs = songs.filter((s) => {
    const matchesFilter = filterMode === 'all' ? true : filterMode === 'active' ? s.is_active : !s.is_active
    const searchLower = search.toLowerCase()
    const matchesSearch = !search || s.title.toLowerCase().includes(searchLower) || (s.artist ?? '').toLowerCase().includes(searchLower)
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
    if (!confirm('Delete this song from the library? This cannot be undone.')) return
    setMsg('')
    const { error } = await supabase.from('project_songs').delete().eq('id', id)
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
      if (lines.length < 2) { showMsg('CSV file appears to be empty or has no data rows.', true); setImporting(false); return }

      const rawHeaders = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
      const titleIdx = rawHeaders.indexOf('title')
      if (titleIdx === -1) { showMsg('CSV must have a "title" column. See the import guide for details.', true); setImporting(false); return }

      const artistIdx = rawHeaders.indexOf('artist')
      const keyIdx = rawHeaders.indexOf('key')
      const notesIdx = rawHeaders.indexOf('notes')
      const btIdx = rawHeaders.indexOf('uses_backing_track')
      const activeIdx = rawHeaders.indexOf('is_active')
      const hasActiveColumn = activeIdx !== -1

      const { data: existingSongs } = await supabase.from('project_songs').select('id, title, artist, is_active').eq('project_id', projectId)
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

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14,
  }

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', border: '1px solid #ddd', borderRadius: 20,
    background: active ? '#111' : 'none', color: active ? 'white' : '#555',
    fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
  })

  const renderSongForm = (form: EditForm, setForm: (f: EditForm) => void, onSave: () => void, onCancel: () => void, saveLabel = 'Save') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
      <input placeholder="Song title (required)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
        <input placeholder="Artist (optional)" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
        <input placeholder="Key (e.g. G, Am)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
      </div>
      <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id={`bt_${saveLabel}`} checked={form.uses_backing_track} onChange={(e) => setForm({ ...form, uses_backing_track: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }} />
        <label htmlFor={`bt_${saveLabel}`} style={{ fontSize: 13, cursor: 'pointer', color: '#444' }}>Uses backing track / sampled music</label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSave} disabled={saving} style={{ padding: '7px 16px', background: saving ? '#999' : '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} style={{ padding: '7px 14px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#555' }}>Cancel</button>
      </div>
    </div>
  )

  const activeCount = songs.filter((s) => s.is_active).length
  const inactiveCount = songs.filter((s) => !s.is_active).length

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Song Library</h3>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        {songs.length} song{songs.length !== 1 ? 's' : ''} total — {activeCount} active, {inactiveCount} inactive
      </p>

      {/* CSV import callout — always visible */}
      {canEdit && (
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#1a4a7a' }}>
            📋 <strong>Importing from a spreadsheet?</strong> Your CSV file must have a <code style={{ background: '#dceeff', padding: '1px 4px', borderRadius: 3 }}>title</code> column. Column names must be lowercase.
          </div>
          <button
            onClick={() => setShowImportHelp(!showImportHelp)}
            style={{ padding: '5px 12px', background: '#1a6abf', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            {showImportHelp ? 'Hide full guide' : 'See full guide →'}
          </button>
        </div>
      )}

      {/* Full CSV guide */}
      {showImportHelp && (
        <div style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 20, fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>CSV Import Guide</div>

          <p style={{ marginBottom: 12, color: '#555', lineHeight: 1.6 }}>
            Create your song list in Excel or Google Sheets, then save/export as a <strong>.csv</strong> file. The first row must be the column headers exactly as shown below.
          </p>

          <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#eee' }}>
                {['Column name', 'Required?', 'What to put in it', 'Example'].map((h) => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, border: '1px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['title', '✅ Yes', 'The song name', "Don't Stop Believin'"],
                ['artist', 'No', 'Original artist or band', 'Journey'],
                ['key', 'No', 'Musical key', 'E, Am, Bb'],
                ['notes', 'No', 'Any notes for the band', 'Capo 2, starts slow'],
                ['uses_backing_track', 'No', 'Does it use sampled/backing music?', 'yes or no'],
                ['is_active', 'No', 'Is the song currently in rotation?', 'yes or no'],
              ].map(([col, req, desc, ex]) => (
                <tr key={col as string}>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: 12, background: col === 'title' ? '#fff8e1' : 'white' }}>{col as string}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: req === '✅ Yes' ? '#1a7a3a' : '#888', fontWeight: req === '✅ Yes' ? 600 : 400 }}>{req as string}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: '#555' }}>{desc as string}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: '#888', fontStyle: 'italic' }}>{ex as string}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ background: 'white', border: '1px solid #ddd', borderRadius: 6, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Example CSV file:</div>
            <pre style={{ fontSize: 12, color: '#333', overflowX: 'auto', margin: 0 }}>{`title,artist,key,notes,uses_backing_track,is_active
Don't Stop Believin',Journey,E,Big ending,no,yes
Africa,Toto,Ab,,no,yes
September,Earth Wind & Fire,D,Horn intro,yes,yes
Uptown Funk,Bruno Mars,Dm,,yes,no`}</pre>
          </div>

          <div style={{ lineHeight: 1.7, color: '#555' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Good to know:</div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>Column names must be <strong>lowercase</strong> and spelled exactly as shown</li>
              <li>Columns you don't need can be left out entirely</li>
              <li>Song titles with commas or apostrophes work fine — just wrap them in quotes</li>
              <li>For yes/no columns, you can use: <code>yes</code>, <code>no</code>, <code>true</code>, <code>false</code>, <code>1</code>, or <code>0</code></li>
              <li>If <code>is_active</code> is left out, all imported songs default to active</li>
              <li><strong>Re-importing:</strong> Songs are matched by title + artist. New songs are added. Existing songs are only updated if the <code>is_active</code> column is present — everything else is left unchanged</li>
              <li>Blank rows in the middle of your file are skipped automatically</li>
            </ul>
          </div>
        </div>
      )}

      {/* Actions row */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <button onClick={() => { setShowAddForm(!showAddForm); setMsg('') }} style={{ padding: '7px 14px', background: '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add Song
          </button>
          <label style={{ padding: '7px 14px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#333', display: 'inline-block' }}>
            {importing ? 'Importing…' : '⬆ Import CSV'}
            <input type="file" accept=".csv" onChange={handleFileImport} style={{ display: 'none' }} disabled={importing} />
          </label>
          {songs.length > 0 && (
            <button onClick={exportCSV} style={{ padding: '7px 14px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#333' }}>
              ⬇ Export CSV
            </button>
          )}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div style={{ background: '#edfff3', border: '1px solid #b2f0c8', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1a7a3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ Import complete — {importResult.added} added, {importResult.updated} updated, {importResult.skipped} unchanged</span>
          <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a7a3a', fontSize: 13 }}>Dismiss</button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && canEdit && renderSongForm(addForm, setAddForm, addSong, () => { setShowAddForm(false); setAddForm(blankForm) }, 'Add Song')}

      {msg && <p style={{ fontSize: 13, color: isError ? '#c00' : '#1a7a3a', marginBottom: 12 }}>{msg}</p>}

      {/* Search and filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            placeholder="Search by title or artist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const, paddingRight: search ? 32 : 10 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0 }}>×</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={filterBtnStyle(filterMode === 'active')} onClick={() => setFilterMode('active')}>Active ({activeCount})</button>
          <button style={filterBtnStyle(filterMode === 'inactive')} onClick={() => setFilterMode('inactive')}>Inactive ({inactiveCount})</button>
          <button style={filterBtnStyle(filterMode === 'all')} onClick={() => setFilterMode('all')}>All ({songs.length})</button>
        </div>
      </div>

      {loading && <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>}

      {!loading && filteredSongs.length === 0 && (
        <p style={{ fontSize: 14, color: '#888', fontStyle: 'italic' }}>
          {songs.length === 0 ? 'No songs yet — add your first song above or import a CSV.' : 'No songs match your search or filter.'}
        </p>
      )}

      {/* Song list — single line per song */}
      {filteredSongs.map((song) => {
        const isEditing = editingId === song.id
        return (
          <div key={song.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', marginBottom: 6, background: song.is_active ? 'white' : '#fafafa', opacity: song.is_active ? 1 : 0.7 }}>
            {isEditing ? (
              renderSongForm(editForm, setEditForm, saveEdit, () => { setEditingId(null); setEditForm(blankForm) }, 'Save')
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                {/* Main info — single line */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{song.title}</span>
                  {song.artist && <span style={{ fontSize: 13, color: '#666', whiteSpace: 'nowrap' }}>— {song.artist}</span>}
                  {song.key && <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>· {song.key}</span>}
                  {song.uses_backing_track && (
                    <span style={{ fontSize: 10, background: '#f0ecff', color: '#6c47ff', padding: '1px 5px', borderRadius: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>BT</span>
                  )}
                  {song.notes && <span style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{song.notes}</span>}
                  {!song.is_active && <span style={{ fontSize: 11, background: '#f5f5f5', color: '#999', padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>Inactive</span>}
                </div>

                {/* Controls */}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 8, flexShrink: 0 }}>
                    <button onClick={() => startEdit(song)} style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: 'none' }}>Edit</button>
                    <button onClick={() => toggleActive(song)} style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: 'none' }}>
                      {song.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    {canDelete && (
                      <button onClick={() => deleteSong(song.id)} style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: 'none', color: '#c00' }}>Delete</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
