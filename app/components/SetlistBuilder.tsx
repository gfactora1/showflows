'use client'

import { useState, useRef, useEffect } from 'react'

type Song = {
  order: number
  set: number
  title: string
  key: string
  notes: string
  uses_backing_track: boolean
  library_song_id?: string | null
}

type PersonalNote = {
  id: string
  song_order: number
  notes: string
}

type Props = {
  songs: Song[]
  personalNotes: Record<number, PersonalNote>
  canEdit: boolean
  savingSetlist: boolean
  onSongsChange: (songs: Song[]) => void
  onEditNote: (songOrder: number) => void
  onRemoveSong: (index: number) => void
  editingNote: number | null
  noteInput: string
  setNoteInput: (v: string) => void
  onSaveNote: (songOrder: number) => void
  onCancelNote: () => void
  savingNote: boolean
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export default function SetlistBuilder({
  songs, personalNotes, canEdit, savingSetlist,
  onSongsChange, onEditNote, onRemoveSong,
  editingNote, noteInput, setNoteInput, onSaveNote, onCancelNote, savingNote,
}: Props) {
  const isMobile = useIsMobile()

  // Drag state
  const dragSongIndex = useRef<number | null>(null)
  const dragOverSet = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<{ set: number; index: number } | null>(null)

  // Build set columns — always include Unassigned (0) if any unassigned, plus all used sets
  const usedSets = Array.from(new Set(songs.map((s) => s.set ?? 1))).sort((a, b) => a - b)
  const hasUnassigned = songs.some((s) => (s.set ?? 1) === 0)
  const assignedSetNums = usedSets.filter((s) => s !== 0)
  const maxSet = assignedSetNums.length > 0 ? Math.max(...assignedSetNums) : 0
  const setColumns = [
    ...(hasUnassigned ? [0] : []),
    ...Array.from({ length: maxSet }, (_, i) => i + 1),
  ]
  // Always show at least Set 1
  if (!setColumns.includes(1) && !hasUnassigned) setColumns.push(1)

  const songsInSet = (setNum: number) =>
    songs.filter((s) => (s.set ?? 1) === setNum)
      .sort((a, b) => a.order - b.order)

  const addNewSet = () => {
    const newSetNum = maxSet + 1
    // Just show the column — no songs needed yet
    const updated = [...songs]
    // We don't add songs here, just ensure the column appears by updating state
    // We trigger re-render by noting the set exists via a placeholder approach
    // Actually just update a song if we can — otherwise just show the column
    onSongsChange(updated)
    // Force column to appear by adding a dummy then removing — instead, just track sets separately
    // Simpler: we'll track extra empty sets in parent
    _addEmptySet(newSetNum)
  }

  const [extraSets, setExtraSets] = useState<number[]>([])

  const _addEmptySet = (setNum: number) => {
    setExtraSets((prev) => prev.includes(setNum) ? prev : [...prev, setNum])
  }

  const allSetColumns = [
    ...setColumns,
    ...extraSets.filter((s) => !setColumns.includes(s)),
  ].sort((a, b) => a - b)

  const moveToSet = (songIndex: number, newSet: number) => {
    const updated = songs.map((s, i) => i === songIndex ? { ...s, set: newSet } : s)
    // Reorder within sets
    const reordered = reorderAllSets(updated)
    onSongsChange(reordered)
  }

  const reorderAllSets = (songList: Song[]): Song[] => {
    // Keep global order numbers consistent
    return songList.map((s, i) => ({ ...s, order: i + 1 }))
  }

  const moveSongWithinSet = (songIndex: number, direction: 'up' | 'down') => {
    const setNum = songs[songIndex].set ?? 1
    const setSongs = songsInSet(setNum)
    const posInSet = setSongs.findIndex((s) => songs.indexOf(s) === songIndex)
    const newPosInSet = direction === 'up' ? posInSet - 1 : posInSet + 1
    if (newPosInSet < 0 || newPosInSet >= setSongs.length) return

    const targetSong = setSongs[newPosInSet]
    const targetIndex = songs.indexOf(targetSong)

    const updated = [...songs]
    ;[updated[songIndex], updated[targetIndex]] = [updated[targetIndex], updated[songIndex]]
    onSongsChange(reorderAllSets(updated))
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, songIndex: number) => {
    dragSongIndex.current = songIndex
    setDragActive(true)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    if (dragSongIndex.current !== null && dropTarget !== null) {
      const fromIndex = dragSongIndex.current
      const toSet = dropTarget.set
      const toIndexInSet = dropTarget.index

      // Move song to new set
      const updated = songs.map((s, i) => i === fromIndex ? { ...s, set: toSet } : s)

      // Reorder within the target set based on drop position
      const targetSetSongs = updated.filter((s) => (s.set ?? 1) === toSet)
      const movedSong = updated[fromIndex]

      // Remove from target set list and reinsert at position
      const withoutMoved = targetSetSongs.filter((s) => s !== movedSong)
      const insertAt = Math.min(toIndexInSet, withoutMoved.length)
      withoutMoved.splice(insertAt, 0, movedSong)

      // Rebuild full songs array with new ordering
      const otherSongs = updated.filter((s) => (s.set ?? 1) !== toSet || s === movedSong)
      // Reconstruct: other sets stay, target set reordered
      const finalSongs: Song[] = []
      const otherSetSongs = updated.filter((s) => (s.set ?? 1) !== toSet)

      // Interleave: keep other set songs in original position, insert target set songs
      let targetIdx = 0
      for (const s of updated) {
        if ((s.set ?? 1) === toSet) {
          if (targetIdx < withoutMoved.length) {
            finalSongs.push(withoutMoved[targetIdx++])
          }
        } else {
          finalSongs.push(s)
        }
      }
      // Add any remaining target set songs
      while (targetIdx < withoutMoved.length) {
        finalSongs.push(withoutMoved[targetIdx++])
      }

      onSongsChange(reorderAllSets(finalSongs))
    }

    dragSongIndex.current = null
    dragOverSet.current = null
    dragOverIndex.current = null
    setDragActive(false)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, setNum: number, indexInSet: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ set: setNum, index: indexInSet })
  }

  const handleDrop = (e: React.DragEvent, setNum: number, indexInSet: number) => {
    e.preventDefault()
    setDropTarget({ set: setNum, index: indexInSet })
  }

  const handleDropOnColumn = (e: React.DragEvent, setNum: number) => {
    e.preventDefault()
    const setSongs = songsInSet(setNum)
    setDropTarget({ set: setNum, index: setSongs.length })
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13,
  }

  const renderSongCard = (song: Song, globalIndex: number, setNum: number, indexInSet: number) => {
    const personalNote = personalNotes[song.order]
    const isEditingThisSong = editingNote === song.order
    const isDragging = dragActive && dragSongIndex.current === globalIndex
    const isDropTarget = dropTarget?.set === setNum && dropTarget?.index === indexInSet

    return (
      <div key={globalIndex}>
        {/* Drop indicator line */}
        {isDropTarget && dragActive && (
          <div style={{ height: 2, background: '#6c47ff', borderRadius: 2, margin: '2px 0' }} />
        )}
        <div
          draggable={canEdit && !isMobile}
          onDragStart={canEdit ? (e) => handleDragStart(e, globalIndex) : undefined}
          onDragEnd={canEdit ? handleDragEnd : undefined}
          onDragOver={canEdit ? (e) => handleDragOver(e, setNum, indexInSet) : undefined}
          onDrop={canEdit ? (e) => handleDrop(e, setNum, indexInSet) : undefined}
          style={{
            background: isDragging ? '#f0ecff' : 'white',
            border: isDragging ? '1.5px dashed #6c47ff' : '1px solid #e5e5e5',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 6,
            cursor: canEdit && !isMobile ? 'grab' : 'default',
            opacity: isDragging ? 0.5 : 1,
            transition: 'opacity 0.1s',
          }}
        >
          {/* Song info */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            {canEdit && !isMobile && (
              <span style={{ fontSize: 14, color: '#ccc', cursor: 'grab', flexShrink: 0, marginTop: 1 }}>⠿</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{song.title}</span>
                {song.uses_backing_track && <span style={{ fontSize: 9, background: '#f0ecff', color: '#6c47ff', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>BT</span>}
                {song.library_song_id && <span style={{ fontSize: 9, background: '#f0fff4', color: '#1a7a3a', padding: '1px 4px', borderRadius: 3 }}>📚</span>}
              </div>
              {(song.key || song.notes) && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {song.key && <span>{song.key}</span>}
                  {song.key && song.notes && <span> · </span>}
                  {song.notes && <span style={{ fontStyle: 'italic' }}>{song.notes}</span>}
                </div>
              )}
            </div>

            {/* Controls */}
            {canEdit && (
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {isMobile && (
                  <>
                    <button onClick={() => moveSongWithinSet(globalIndex, 'up')} disabled={indexInSet === 0} style={{ padding: '2px 5px', fontSize: 10, cursor: indexInSet === 0 ? 'not-allowed' : 'pointer', opacity: indexInSet === 0 ? 0.3 : 1 }}>▲</button>
                    <button onClick={() => moveSongWithinSet(globalIndex, 'down')} disabled={indexInSet === songsInSet(setNum).length - 1} style={{ padding: '2px 5px', fontSize: 10, cursor: indexInSet === songsInSet(setNum).length - 1 ? 'not-allowed' : 'pointer', opacity: indexInSet === songsInSet(setNum).length - 1 ? 0.3 : 1 }}>▼</button>
                  </>
                )}
                <button onClick={() => onRemoveSong(globalIndex)} style={{ padding: '2px 5px', fontSize: 10, color: '#c00', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          {/* Mobile set selector */}
          {canEdit && isMobile && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, color: '#aaa' }}>Move to set:</label>
              <select
                value={song.set ?? 1}
                onChange={(e) => moveToSet(globalIndex, parseInt(e.target.value))}
                style={{ ...inputStyle, fontSize: 11, padding: '3px 6px' }}
              >
                <option value={0}>Unassigned</option>
                {Array.from({ length: Math.max(maxSet, 1) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>Set {n}</option>
                ))}
                <option value={maxSet + 1}>New Set {maxSet + 1}</option>
              </select>
            </div>
          )}

          {/* Personal note */}
          <div style={{ marginTop: 6 }}>
            {isEditingThisSong ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <input autoFocus placeholder="Your note…" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSaveNote(song.order); if (e.key === 'Escape') onCancelNote() }} style={{ ...inputStyle, flex: 1, minWidth: 120, fontSize: 12 }} />
                <button onClick={() => onSaveNote(song.order)} disabled={savingNote} style={{ padding: '4px 10px', background: '#111', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>{savingNote ? '…' : 'Save'}</button>
                <button onClick={onCancelNote} style={{ padding: '4px 8px', background: 'none', border: '1px solid #ddd', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {personalNote ? (
                  <>
                    <span style={{ fontSize: 11, color: '#6c47ff', fontStyle: 'italic' }}>📝 {personalNote.notes}</span>
                    <button onClick={() => onEditNote(song.order)} style={{ background: 'none', border: 'none', fontSize: 10, color: '#aaa', cursor: 'pointer', padding: 0 }}>Edit</button>
                  </>
                ) : (
                  <button onClick={() => onEditNote(song.order)} style={{ background: 'none', border: 'none', fontSize: 11, color: '#ccc', cursor: 'pointer', padding: 0 }}>+ My note</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (songs.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#888', fontStyle: 'italic' }}>
        No songs yet.{canEdit && ' Use the buttons above to add songs.'}
      </p>
    )
  }

  // MOBILE — stacked layout
  if (isMobile) {
    return (
      <div>
        {allSetColumns.map((setNum) => {
          const setSongs = songsInSet(setNum)
          return (
            <div key={setNum} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: setNum === 0 ? '#7a5500' : '#888',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
                paddingBottom: 6, borderBottom: `2px solid ${setNum === 0 ? '#ffe0a0' : '#eee'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {setNum === 0 ? '⚠️ Unassigned' : `Set ${setNum}`}
                <span style={{ fontWeight: 400, color: '#aaa' }}>({setSongs.length})</span>
              </div>
              {setNum === 0 && setSongs.length > 0 && (
                <div style={{ fontSize: 11, color: '#a07000', marginBottom: 8, background: '#fffbf0', border: '1px solid #ffe0a0', borderRadius: 6, padding: '6px 10px' }}>
                  Use "Move to set" on each song to assign it before printing
                </div>
              )}
              {setSongs.length === 0 && (
                <div style={{ fontSize: 12, color: '#ccc', fontStyle: 'italic', padding: '8px 0' }}>Empty</div>
              )}
              {setSongs.map((song) => {
                const globalIndex = songs.indexOf(song)
                const indexInSet = setSongs.indexOf(song)
                return renderSongCard(song, globalIndex, setNum, indexInSet)
              })}
            </div>
          )
        })}
      </div>
    )
  }

  // DESKTOP — drag and drop columns
  return (
    <div
      style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}
      onDragEnd={handleDragEnd}
    >
      {allSetColumns.map((setNum) => {
        const setSongs = songsInSet(setNum)
        const isUnassigned = setNum === 0
        const isDropTargetColumn = dropTarget?.set === setNum && dragActive

        return (
          <div
            key={setNum}
            onDragOver={(e) => { e.preventDefault(); if (setSongs.length === 0) setDropTarget({ set: setNum, index: 0 }) }}
            onDrop={(e) => handleDropOnColumn(e, setNum)}
            style={{
              minWidth: 220,
              maxWidth: 260,
              flex: '0 0 240px',
              background: isDropTargetColumn ? '#f8f5ff' : isUnassigned ? '#fffbf0' : '#f9f9f9',
              border: `2px ${isDropTargetColumn ? 'dashed #6c47ff' : 'solid'} ${isUnassigned ? '#ffe0a0' : '#eee'}`,
              borderRadius: 10,
              padding: 12,
              transition: 'background 0.1s, border-color 0.1s',
            }}
          >
            {/* Column header */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: isUnassigned ? '#7a5500' : '#333' }}>
                  {isUnassigned ? '⚠️ Unassigned' : `Set ${setNum}`}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                  {setSongs.length} song{setSongs.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {isUnassigned && setSongs.length > 0 && (
              <div style={{ fontSize: 11, color: '#a07000', marginBottom: 10, background: '#fff8e1', borderRadius: 5, padding: '5px 8px' }}>
                Drag songs to a set column
              </div>
            )}

            {/* Drop zone when empty */}
            {setSongs.length === 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: 0 }) }}
                onDrop={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: 0 }) }}
                style={{
                  border: '2px dashed #ddd', borderRadius: 8, padding: '20px 12px',
                  textAlign: 'center', fontSize: 12, color: '#ccc',
                  background: isDropTargetColumn ? '#f0ecff' : 'transparent',
                }}
              >
                {dragActive ? 'Drop here' : 'Empty'}
              </div>
            )}

            {/* Songs */}
            {setSongs.map((song, indexInSet) => {
              const globalIndex = songs.indexOf(song)
              return renderSongCard(song, globalIndex, setNum, indexInSet)
            })}

            {/* Drop zone at bottom of non-empty column */}
            {setSongs.length > 0 && dragActive && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: setSongs.length }) }}
                onDrop={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: setSongs.length }) }}
                style={{ height: 32, border: '2px dashed transparent', borderRadius: 6, marginTop: 4, borderColor: dropTarget?.set === setNum && dropTarget?.index === setSongs.length ? '#6c47ff' : 'transparent' }}
              />
            )}
          </div>
        )
      })}

      {/* Add new set column */}
      {canEdit && (
        <div
          onClick={addNewSet}
          style={{
            minWidth: 80, flex: '0 0 80px', border: '2px dashed #ddd', borderRadius: 10,
            padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#bbb', fontSize: 12, fontWeight: 500,
            transition: 'border-color 0.1s, color 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6c47ff'; e.currentTarget.style.color = '#6c47ff' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#bbb' }}
        >
          + Set {(allSetColumns.filter((s) => s !== 0).length) + 1}
        </div>
      )}
    </div>
  )
}
