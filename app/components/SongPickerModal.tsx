'use client'

import { useState, useEffect, useRef } from 'react'
import { colors, radius, font, transition } from './tokens'

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
  alreadyInSetlist: Set<string>
  onAdd: (selected: LibrarySong[]) => void
  onClose: () => void
}

export default function SongPickerModal({ songs, alreadyInSetlist, onAdd, onClose }: Props) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<Map<string, LibrarySong>>(new Map())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

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
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: radius.xl,
        width: '100%',
        maxWidth: 860,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        fontFamily: font.sans,
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
              Add Songs from Library
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
              Select songs to add — they'll go to Unassigned so you can drag them into sets
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              fontSize: 22, cursor: 'pointer',
              color: colors.textMuted, padding: 0, lineHeight: 1,
              transition: `color ${transition.normal}`,
            }}
            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = colors.textPrimary}
            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = colors.textMuted}
          >×</button>
        </div>

        {/* Body — two columns */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left — song list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${colors.border}`, overflow: 'hidden' }}>

            {/* Search */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
              <input
                ref={searchRef}
                placeholder="Search by title or artist…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 11px',
                  background: colors.elevated,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radius.md,
                  fontSize: 13,
                  color: colors.textPrimary,
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: font.sans,
                }}
              />
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
                {filtered.length} song{filtered.length !== 1 ? 's' : ''} {search ? 'matching' : 'in library'}
              </div>
            </div>

            {/* Song list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <div style={{ padding: 24, fontSize: 13, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
                  No songs match your search.
                </div>
              )}
              {filtered.map((song) => {
                const isInSetlist = alreadyInSetlist.has(song.id)
                const isSelected  = selected.has(song.id)

                return (
                  <div
                    key={song.id}
                    onClick={() => toggleSong(song)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      borderBottom: `1px solid ${colors.border}`,
                      cursor: isInSetlist ? 'not-allowed' : 'pointer',
                      background: isSelected
                        ? colors.violetSoft2
                        : isInSetlist
                        ? 'rgba(255,255,255,0.01)'
                        : 'transparent',
                      opacity: isInSetlist ? 0.45 : 1,
                      transition: `background ${transition.normal}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isInSetlist && !isSelected)
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isInSetlist && !isSelected)
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isInSetlist}
                      onChange={() => toggleSong(song)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: 15, height: 15, flexShrink: 0,
                        cursor: isInSetlist ? 'not-allowed' : 'pointer',
                        accentColor: colors.violet,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>
                          {song.title}
                        </span>
                        {song.artist && (
                          <span style={{ fontSize: 12, color: colors.textSecondary }}>— {song.artist}</span>
                        )}
                        {song.key && (
                          <span style={{ fontSize: 11, color: colors.textMuted }}>· {song.key}</span>
                        )}
                        {song.uses_backing_track && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: colors.violetSoft2, color: colors.violetLight,
                            padding: '1px 5px', borderRadius: radius.sm,
                          }}>BT</span>
                        )}
                      </div>
                      {song.notes && (
                        <div style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 }}>
                          {song.notes}
                        </div>
                      )}
                      {isInSetlist && (
                        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>Already in setlist</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — selected songs queue */}
          <div style={{ width: 240, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.border}`,
              flexShrink: 0,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>
                Selected{selected.size > 0 ? ` (${selected.size})` : ''}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {selectedList.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: colors.textDim, fontStyle: 'italic' }}>
                  Check songs on the left to select them.
                </div>
              ) : (
                selectedList.map((song, i) => (
                  <div key={song.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderBottom: `1px solid ${colors.border}`,
                  }}>
                    <span style={{ fontSize: 11, color: colors.textDim, minWidth: 18, textAlign: 'right' }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {song.title}
                      </div>
                      {song.artist && (
                        <div style={{ fontSize: 11, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.artist}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleSong(song)}
                      style={{
                        background: 'none', border: 'none',
                        cursor: 'pointer', color: colors.textMuted,
                        fontSize: 16, padding: 0, flexShrink: 0,
                        lineHeight: 1,
                        transition: `color ${transition.normal}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = colors.red}
                      onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = colors.textMuted}
                    >×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: colors.card,
        }}>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            {selected.size === 0
              ? 'Select songs to add'
              : `${selected.size} song${selected.size !== 1 ? 's' : ''} selected`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 18px',
                background: 'transparent',
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: radius.md,
                fontSize: 13,
                cursor: 'pointer',
                color: colors.textSecondary,
                fontFamily: font.sans,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              style={{
                padding: '7px 20px',
                background: selected.size === 0 ? colors.elevated : colors.violet,
                color: selected.size === 0 ? colors.textMuted : 'white',
                border: 'none',
                borderRadius: radius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                fontFamily: font.sans,
                transition: `background ${transition.normal}`,
              }}
            >
              Add {selected.size > 0 ? `${selected.size} ` : ''}Song{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
