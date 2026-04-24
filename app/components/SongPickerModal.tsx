'use client'

import { useState, useEffect, useRef } from 'react'

type LibrarySong = {
  id: string
  title: string
  artist: string | null
  key: string | null
  notes: string | null
  uses_backing_track: boolean
}

type Props = {
  songs: LibrarySong[]
  alreadyInSetlist: Set<string> // library_song_ids already in the setlist
  onAdd: (selected: LibrarySong[]) => void
  onClose: () => void
}

export default function SongPickerModal({ songs, alreadyInSetlist, onAdd, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Map<string, LibrarySong>>(new Map())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const filtered = songs.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
  })

  const toggleSong = (song: LibrarySong) => {
    if (alreadyInSetlist.has(song.id)) return
    const next = new Map(selected)
    if (next.has(song.id)) next.delete(song.id)
    else next.set(song.id, song)
    setSelected(next)
  }

  const handleAdd = () => {
    if (selected.size === 0) return
    onAdd(Array.from(selected.values()))
  }

  const selectedList = Array.from(selected.values())

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 860,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Add Songs from Library</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
              Check songs to add — they'll go to Unassigned so you can organize them into sets
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body — two columns */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left — song list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #eee', overflow: 'hidden' }}>
            {/* Search */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
              <input
                ref={searchRef}
                placeholder="Search by title or artist…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const }}
              />
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
                {filtered.length} song{filtered.length !== 1 ? 's' : ''} {search ? 'matching' : 'in library'}
              </div>
            </div>

            {/* Song list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <div style={{ padding: 20, fontSize: 13, color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                  No songs match your search.
                </div>
              )}
              {filtered.map((song) => {
                const isInSetlist = alreadyInSetlist.has(song.id)
                const isSelected = selected.has(song.id)

                return (
                  <div
                    key={song.id}
                    onClick={() => toggleSong(song)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px', borderBottom: '1px solid #f5f5f5',
                      cursor: isInSetlist ? 'not-allowed' : 'pointer',
                      background: isSelected ? '#f0ecff' : isInSetlist ? '#fafafa' : 'white',
                      opacity: isInSetlist ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isInSetlist && !isSelected) e.currentTarget.style.background = '#f9f9f9' }}
                    onMouseLeave={(e) => { if (!isInSetlist && !isSelected) e.currentTarget.style.background = 'white' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isInSetlist}
                      onChange={() => toggleSong(song)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 16, height: 16, flexShrink: 0, cursor: isInSetlist ? 'not-allowed' : 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{song.title}</span>
                        {song.artist && <span style={{ fontSize: 13, color: '#666' }}>— {song.artist}</span>}
                        {song.key && <span style={{ fontSize: 12, color: '#555' }}>· {song.key}</span>}
                        {song.uses_backing_track && (
                          <span style={{ fontSize: 10, background: '#f0ecff', color: '#6c47ff', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>BT</span>
                        )}
                      </div>
                      {song.notes && <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', marginTop: 2 }}>{song.notes}</div>}
                      {isInSetlist && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Already in setlist</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — selected songs */}
          <div style={{ width: 260, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                Selected {selected.size > 0 ? `(${selected.size})` : ''}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {selectedList.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>
                  Check songs on the left to add them here.
                </div>
              ) : (
                selectedList.map((song, i) => (
                  <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: 12, color: '#ccc', minWidth: 18, textAlign: 'right' }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                      {song.artist && <div style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>}
                    </div>
                    <button
                      onClick={() => toggleSong(song)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: 0, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: '#888' }}>
            {selected.size === 0 ? 'Select songs to add' : `${selected.size} song${selected.size !== 1 ? 's' : ''} selected`}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, cursor: 'pointer', color: '#555' }}>
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              style={{ padding: '8px 20px', background: selected.size === 0 ? '#999' : '#111', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}
            >
              Add {selected.size > 0 ? `${selected.size} ` : ''}Song{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
