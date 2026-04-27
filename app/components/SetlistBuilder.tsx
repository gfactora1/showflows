'use client'

import { useState, useRef, useEffect } from 'react'
import { colors, radius, font, transition } from './tokens'

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
  const [expandedSongs, setExpandedSongs] = useState<Set<number>>(new Set())

  const dragSongIndex = useRef<number | null>(null)
  const [dragActive, setDragActive]   = useState(false)
  const [dropTarget, setDropTarget]   = useState<{ set: number; index: number } | null>(null)
  const [extraSets, setExtraSets]     = useState<number[]>([])

  const usedSets          = Array.from(new Set(songs.map((s) => s.set ?? 1))).sort((a, b) => a - b)
  const hasUnassigned     = songs.some((s) => (s.set ?? 1) === 0)
  const assignedSetNums   = usedSets.filter((s) => s !== 0)
  const maxSet            = assignedSetNums.length > 0 ? Math.max(...assignedSetNums) : 0
  const setColumns        = [
    ...(hasUnassigned ? [0] : []),
    ...Array.from({ length: maxSet }, (_, i) => i + 1),
  ]
  if (!setColumns.includes(1) && !hasUnassigned) setColumns.push(1)

  const allSetColumns = [
    ...setColumns,
    ...extraSets.filter((s) => !setColumns.includes(s)),
  ].sort((a, b) => a - b)

  const songsInSet = (setNum: number) =>
    songs.filter((s) => (s.set ?? 1) === setNum).sort((a, b) => a.order - b.order)

  const reorderAllSets = (songList: Song[]): Song[] =>
    songList.map((s, i) => ({ ...s, order: i + 1 }))

  const addNewSet = () => {
    const newSetNum = maxSet + 1
    setExtraSets((prev) => prev.includes(newSetNum) ? prev : [...prev, newSetNum])
  }

  const moveToSet = (songIndex: number, newSet: number) => {
    const updated = songs.map((s, i) => i === songIndex ? { ...s, set: newSet } : s)
    onSongsChange(reorderAllSets(updated))
  }

  const moveSongWithinSet = (songIndex: number, direction: 'up' | 'down') => {
    const setNum   = songs[songIndex].set ?? 1
    const setSongs = songsInSet(setNum)
    const posInSet = setSongs.findIndex((s) => songs.indexOf(s) === songIndex)
    const newPos   = direction === 'up' ? posInSet - 1 : posInSet + 1
    if (newPos < 0 || newPos >= setSongs.length) return
    const targetSong  = setSongs[newPos]
    const targetIndex = songs.indexOf(targetSong)
    const updated     = [...songs]
    ;[updated[songIndex], updated[targetIndex]] = [updated[targetIndex], updated[songIndex]]
    onSongsChange(reorderAllSets(updated))
  }

  const toggleExpanded = (songOrder: number) => {
    setExpandedSongs((prev) => {
      const next = new Set(prev)
      if (next.has(songOrder)) next.delete(songOrder)
      else next.add(songOrder)
      return next
    })
  }

  const handleDragStart = (e: React.DragEvent, songIndex: number) => {
    dragSongIndex.current = songIndex
    setDragActive(true)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    if (dragSongIndex.current !== null && dropTarget !== null) {
      const fromIndex    = dragSongIndex.current
      const toSet        = dropTarget.set
      const toIndexInSet = dropTarget.index

      const updated  = songs.map((s, i) => i === fromIndex ? { ...s, set: toSet } : s)
      const targetSetSongs = updated.filter((s) => (s.set ?? 1) === toSet)
      const movedSong      = updated[fromIndex]
      const withoutMoved   = targetSetSongs.filter((s) => s !== movedSong)
      const insertAt       = Math.min(toIndexInSet, withoutMoved.length)
      withoutMoved.splice(insertAt, 0, movedSong)

      const finalSongs: Song[] = []
      let targetIdx = 0
      for (const s of updated) {
        if ((s.set ?? 1) === toSet) {
          if (targetIdx < withoutMoved.length) finalSongs.push(withoutMoved[targetIdx++])
        } else {
          finalSongs.push(s)
        }
      }
      while (targetIdx < withoutMoved.length) finalSongs.push(withoutMoved[targetIdx++])
      onSongsChange(reorderAllSets(finalSongs))
    }
    dragSongIndex.current = null
    setDragActive(false)
    setDropTarget(null)
  }

  const handleDragOver  = (e: React.DragEvent, setNum: number, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget({ set: setNum, index: idx }) }
  const handleDrop      = (e: React.DragEvent, setNum: number, idx: number)  => { e.preventDefault(); setDropTarget({ set: setNum, index: idx }) }
  const handleDropOnCol = (e: React.DragEvent, setNum: number)               => { e.preventDefault(); setDropTarget({ set: setNum, index: songsInSet(setNum).length }) }

  // ── Song row (compact, expandable) ───────────────────────────────────────

  const renderSongCard = (song: Song, globalIndex: number, setNum: number, indexInSet: number) => {
    const personalNote      = personalNotes[song.order]
    const isEditingThisSong = editingNote === song.order
    const isDragging        = dragActive && dragSongIndex.current === globalIndex
    const isDropTarget      = dropTarget?.set === setNum && dropTarget?.index === indexInSet
    const isExpanded        = expandedSongs.has(song.order)
    const hasDetails        = !!(song.key || song.notes || song.uses_backing_track || personalNote)

    return (
      <div key={globalIndex}>
        {/* Drop indicator */}
        {isDropTarget && dragActive && (
          <div style={{ height: 2, background: colors.violet, borderRadius: 2, margin: '2px 0' }} />
        )}

        <div
          draggable={canEdit && !isMobile}
          onDragStart={canEdit ? (e) => handleDragStart(e, globalIndex) : undefined}
          onDragEnd={canEdit ? handleDragEnd : undefined}
          onDragOver={canEdit ? (e) => handleDragOver(e, setNum, indexInSet) : undefined}
          onDrop={canEdit ? (e) => handleDrop(e, setNum, indexInSet) : undefined}
          style={{
            background: isDragging ? colors.violetSoft2 : colors.card,
            border: `1px solid ${isDragging ? colors.violet : colors.border}`,
            borderStyle: isDragging ? 'dashed' : 'solid',
            borderRadius: radius.md,
            marginBottom: 3,
            cursor: canEdit && !isMobile ? 'grab' : 'default',
            opacity: isDragging ? 0.6 : 1,
            transition: `opacity ${transition.fast}`,
            overflow: 'hidden',
          }}
        >
          {/* ── Compact row ── */}
          <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>

            {/* Drag handle */}
            {canEdit && !isMobile && (
              <span style={{
                fontSize: 13, color: colors.textDim, cursor: 'grab', flexShrink: 0,
                padding: '0 8px', alignSelf: 'stretch', display: 'flex', alignItems: 'center',
              }}>⠿</span>
            )}

            {/* Mobile up/down */}
            {canEdit && isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '0 4px', gap: 1 }}>
                <button
                  onClick={() => moveSongWithinSet(globalIndex, 'up')}
                  disabled={indexInSet === 0}
                  style={{ padding: '1px 5px', fontSize: 9, cursor: indexInSet === 0 ? 'not-allowed' : 'pointer', opacity: indexInSet === 0 ? 0.2 : 0.6, background: 'transparent', border: 'none', color: colors.textSecondary, lineHeight: 1 }}
                >▲</button>
                <button
                  onClick={() => moveSongWithinSet(globalIndex, 'down')}
                  disabled={indexInSet === songsInSet(setNum).length - 1}
                  style={{ padding: '1px 5px', fontSize: 9, cursor: indexInSet === songsInSet(setNum).length - 1 ? 'not-allowed' : 'pointer', opacity: indexInSet === songsInSet(setNum).length - 1 ? 0.2 : 0.6, background: 'transparent', border: 'none', color: colors.textSecondary, lineHeight: 1 }}
                >▼</button>
              </div>
            )}

            {/* Title + indicators — clicking expands */}
            <button
              onClick={() => toggleExpanded(song.order)}
              style={{
                flex: 1, minWidth: 0, background: 'none', border: 'none',
                cursor: hasDetails ? 'pointer' : 'default',
                padding: '0 6px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                height: '100%',
              }}
            >
              <span style={{
                fontWeight: 500, fontSize: 13, color: colors.textPrimary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{song.title}</span>

              {/* BT badge — always visible */}
              {song.uses_backing_track && (
                <span style={{ fontSize: 9, fontWeight: 700, background: colors.violetSoft2, color: colors.violetLight, padding: '1px 5px', borderRadius: radius.sm, flexShrink: 0 }}>BT</span>
              )}

              {/* Personal note indicator when collapsed */}
              {personalNote && !isExpanded && (
                <span style={{ fontSize: 10, color: colors.violetLight, flexShrink: 0 }}>📝</span>
              )}

              {/* Expand chevron */}
              {hasDetails && (
                <span style={{
                  fontSize: 9, color: colors.textDim, flexShrink: 0, marginLeft: 'auto',
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: `transform ${transition.fast}`,
                }}>▼</span>
              )}
            </button>

            {/* Remove */}
            {canEdit && (
              <button
                onClick={() => onRemoveSong(globalIndex)}
                style={{
                  padding: '0 10px', alignSelf: 'stretch', fontSize: 12,
                  color: colors.red, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderLeft: `1px solid ${colors.border}`,
                  flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>

          {/* ── Expanded details panel ── */}
          {isExpanded && (
            <div style={{
              borderTop: `1px solid ${colors.border}`,
              padding: '10px 12px',
              background: colors.surface,
            }}>
              {/* Key / notes */}
              {(song.key || song.notes) && (
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                  {song.key && <span style={{ fontWeight: 600, color: colors.violetLight }}>{song.key}</span>}
                  {song.key && song.notes && <span style={{ color: colors.textDim }}> · </span>}
                  {song.notes && <span style={{ fontStyle: 'italic' }}>{song.notes}</span>}
                </div>
              )}

              {/* Mobile set selector */}
              {canEdit && isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: colors.textMuted }}>Move to set:</label>
                  <select
                    value={song.set ?? 1}
                    onChange={(e) => moveToSet(globalIndex, parseInt(e.target.value))}
                    style={{ padding: '3px 6px', fontSize: 11, background: colors.elevated, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.sm, color: colors.textPrimary, outline: 'none' }}
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
              {isEditingThisSong ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    autoFocus
                    placeholder="Your note…"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSaveNote(song.order); if (e.key === 'Escape') onCancelNote() }}
                    style={{ flex: 1, minWidth: 120, padding: '5px 8px', background: colors.elevated, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.sm, fontSize: 12, color: colors.textPrimary, outline: 'none', fontFamily: font.sans }}
                  />
                  <button
                    onClick={() => onSaveNote(song.order)}
                    disabled={savingNote}
                    style={{ padding: '4px 10px', background: colors.violet, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: 11, cursor: 'pointer' }}
                  >
                    {savingNote ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={onCancelNote}
                    style={{ padding: '4px 8px', background: 'transparent', border: `1px solid ${colors.borderStrong}`, borderRadius: radius.sm, fontSize: 11, cursor: 'pointer', color: colors.textSecondary }}
                  >×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {personalNote ? (
                    <>
                      <span style={{ fontSize: 11, color: colors.violetLight, fontStyle: 'italic' }}>📝 {personalNote.notes}</span>
                      <button
                        onClick={() => onEditNote(song.order)}
                        style={{ background: 'none', border: 'none', fontSize: 10, color: colors.textMuted, cursor: 'pointer', padding: 0 }}
                      >Edit</button>
                    </>
                  ) : (
                    <button
                      onClick={() => onEditNote(song.order)}
                      style={{ background: 'none', border: 'none', fontSize: 11, color: colors.textMuted, cursor: 'pointer', padding: 0 }}
                    >+ My note</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (songs.length === 0) {
    return (
      <p style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>
        No songs yet.{canEdit && ' Use the buttons above to add songs.'}
      </p>
    )
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div>
        {allSetColumns.map((setNum) => {
          const setSongs     = songsInSet(setNum)
          const isUnassigned = setNum === 0
          return (
            <div key={setNum} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: isUnassigned ? colors.amber : colors.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                paddingBottom: 6,
                borderBottom: `2px solid ${isUnassigned ? 'rgba(245,158,11,0.4)' : colors.border}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {isUnassigned ? '⚠ Unassigned' : `Set ${setNum}`}
                <span style={{ fontWeight: 400, color: colors.textDim }}>({setSongs.length})</span>
              </div>
              {isUnassigned && setSongs.length > 0 && (
                <div style={{ fontSize: 11, color: colors.amber, marginBottom: 8, background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: radius.sm, padding: '6px 10px' }}>
                  Use "Move to set" on each song to assign it before printing.
                </div>
              )}
              {setSongs.length === 0 && (
                <div style={{ fontSize: 12, color: colors.textDim, fontStyle: 'italic', padding: '8px 0' }}>Empty</div>
              )}
              {setSongs.map((song) => renderSongCard(song, songs.indexOf(song), setNum, setSongs.indexOf(song)))}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Desktop drag-and-drop columns ─────────────────────────────────────────

  return (
    <div
      style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}
      onDragEnd={handleDragEnd}
    >
      {allSetColumns.map((setNum) => {
        const setSongs          = songsInSet(setNum)
        const isUnassigned      = setNum === 0
        const isDropTargetCol   = dropTarget?.set === setNum && dragActive

        return (
          <div
            key={setNum}
            onDragOver={(e) => { e.preventDefault(); if (setSongs.length === 0) setDropTarget({ set: setNum, index: 0 }) }}
            onDrop={(e) => handleDropOnCol(e, setNum)}
            style={{
              minWidth: 220, maxWidth: 280, flex: '0 0 240px',
              background: isDropTargetCol ? colors.violetSoft : isUnassigned ? 'rgba(245,158,11,0.05)' : colors.surface,
              border: `2px ${isDropTargetCol ? 'dashed' : 'solid'} ${isDropTargetCol ? colors.violet : isUnassigned ? 'rgba(245,158,11,0.3)' : colors.border}`,
              borderRadius: radius.lg,
              padding: 12,
              transition: `background ${transition.normal}, border-color ${transition.normal}`,
            }}
          >
            {/* Column header */}
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: isUnassigned ? colors.amber : colors.textPrimary }}>
                  {isUnassigned ? '⚠ Unassigned' : `Set ${setNum}`}
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                  {setSongs.length} song{setSongs.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {isUnassigned && setSongs.length > 0 && (
              <div style={{ fontSize: 11, color: colors.amber, marginBottom: 10, background: 'rgba(245,158,11,0.08)', borderRadius: radius.sm, padding: '5px 8px' }}>
                Drag songs to a set column
              </div>
            )}

            {/* Empty drop zone */}
            {setSongs.length === 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: 0 }) }}
                onDrop={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: 0 }) }}
                style={{
                  border: `2px dashed ${isDropTargetCol ? colors.violet : colors.border}`,
                  borderRadius: radius.md,
                  padding: '20px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: colors.textDim,
                  background: isDropTargetCol ? colors.violetSoft : 'transparent',
                }}
              >
                {dragActive ? 'Drop here' : 'Empty'}
              </div>
            )}

            {/* Songs */}
            {setSongs.map((song, indexInSet) =>
              renderSongCard(song, songs.indexOf(song), setNum, indexInSet)
            )}

            {/* Bottom drop zone when dragging */}
            {setSongs.length > 0 && dragActive && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: setSongs.length }) }}
                onDrop={(e) => { e.preventDefault(); setDropTarget({ set: setNum, index: setSongs.length }) }}
                style={{
                  height: 32, borderRadius: radius.sm, marginTop: 4,
                  border: `2px dashed ${dropTarget?.set === setNum && dropTarget?.index === setSongs.length ? colors.violet : 'transparent'}`,
                }}
              />
            )}
          </div>
        )
      })}

      {/* Add new set button */}
      {canEdit && (
        <div
          onClick={addNewSet}
          style={{
            minWidth: 80, flex: '0 0 80px',
            border: `2px dashed ${colors.border}`,
            borderRadius: radius.lg,
            padding: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: colors.textDim,
            fontSize: 12, fontWeight: 500,
            transition: `border-color ${transition.normal}, color ${transition.normal}`,
          }}
          onMouseEnter={(e) => { ;(e.currentTarget as HTMLDivElement).style.borderColor = colors.violet; ;(e.currentTarget as HTMLDivElement).style.color = colors.violet }}
          onMouseLeave={(e) => { ;(e.currentTarget as HTMLDivElement).style.borderColor = colors.border; ;(e.currentTarget as HTMLDivElement).style.color = colors.textDim }}
        >
          + Set {(allSetColumns.filter((s) => s !== 0).length) + 1}
        </div>
      )}
    </div>
  )
}
