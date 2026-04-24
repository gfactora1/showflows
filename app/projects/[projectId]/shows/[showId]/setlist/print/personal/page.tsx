import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import PrintButton from '../PrintButton'

type Song = {
  order: number
  set: number
  title: string
  key: string
  notes: string
  uses_backing_track: boolean
}

type Props = {
  params: Promise<{ projectId: string; showId: string }>
}

function formatShowDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function getSongFontSize(songsInSet: number): number {
  if (songsInSet <= 8) return 36
  if (songsInSet <= 10) return 32
  if (songsInSet <= 13) return 30
  return 28
}

export default async function PersonalSetlistPrintPage({ params }: Props) {
  const { projectId, showId } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    }
  )

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: show } = await supabase
    .from('shows')
    .select('id, title, starts_at, ends_at, venue_id')
    .eq('id', showId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (!show) notFound()

  let venueName: string | null = null
  if (show.venue_id) {
    const { data: venue } = await supabase.from('venues').select('name').eq('id', show.venue_id).maybeSingle()
    venueName = venue?.name ?? null
  }

  const { data: setlist } = await supabase.from('setlists').select('id, songs').eq('show_id', showId).maybeSingle()
  const songs: Song[] = (setlist?.songs ?? []) as Song[]

  // Load this user's personal notes
  const personalNotesMap: Record<number, string> = {}
  if (setlist?.id) {
    const { data: notesData } = await supabase
      .from('member_song_notes')
      .select('song_order, notes')
      .eq('setlist_id', setlist.id)
      .eq('user_id', user.id)

    if (notesData) {
      notesData.forEach((n: any) => { personalNotesMap[n.song_order] = n.notes })
    }
  }

  // Group by set
  const songsBySet = songs.reduce((acc, song) => {
    const setNum = song.set || 1
    if (!acc[setNum]) acc[setNum] = []
    acc[setNum].push(song)
    return acc
  }, {} as Record<number, Song[]>)

  const setNumbers = Object.keys(songsBySet).map(Number).sort((a, b) => a - b)
  const multiplesets = setNumbers.length > 1

  const headerParts = [show.title, venueName, formatShowDate(show.starts_at)].filter(Boolean)
  const headerLine = headerParts.join(' · ')

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: white;
      color: black;
    }
    .set-page {
      padding: 24px 36px;
    }
    .set-page + .set-page {
      page-break-before: always;
      break-before: page;
    }
    .page-header {
      font-size: 11px;
      color: #555;
      letter-spacing: 0.3px;
      padding-bottom: 8px;
      border-bottom: 2px solid black;
      margin-bottom: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .personal-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      background: #6c47ff;
      color: white;
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: 8px;
      vertical-align: middle;
      letter-spacing: 0.3px;
    }
    .set-label {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #333;
      margin-bottom: 10px;
    }
    .song-row {
      padding: 6px 0;
      border-bottom: 1px solid #ddd;
      break-inside: avoid;
    }
    .song-main {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .song-num {
      font-weight: 700;
      color: #bbb;
      min-width: 28px;
      text-align: right;
      flex-shrink: 0;
    }
    .song-title { font-weight: 900; flex-shrink: 0; }
    .bt-badge {
      display: inline-block;
      font-weight: 900;
      background: #111;
      color: white;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
      vertical-align: middle;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .song-key { font-weight: 700; color: #333; flex-shrink: 0; }
    .song-notes { color: #555; font-style: italic; flex: 1; }
    .personal-note {
      margin-left: 40px;
      font-style: italic;
      color: #6c47ff;
      padding-top: 2px;
    }
    .no-songs {
      font-size: 18px;
      color: #888;
      margin-top: 24px;
      font-style: italic;
    }
    @media print {
      .no-print { display: none !important; }
      .set-page { padding: 16px 28px; }
      .song-row { break-inside: avoid; }
      .set-label { break-after: avoid; }
    }
  `

  return (
    <>
      <style>{css}</style>
      <PrintButton />

      {songs.length === 0 ? (
        <div className="set-page">
          <div className="page-header">{headerLine}</div>
          <div className="no-songs">No songs added to this setlist yet.</div>
        </div>
      ) : (
        setNumbers.map((setNum) => {
          const setSongs = songsBySet[setNum]
          const songFontSize = getSongFontSize(setSongs.length)
          const detailFontSize = Math.round(songFontSize * 0.52)
          const numFontSize = Math.round(songFontSize * 0.48)
          const btFontSize = Math.max(detailFontSize - 2, 9)
          const personalNoteFontSize = Math.round(songFontSize * 0.46)

          return (
            <div key={setNum} className="set-page">
              <div className="page-header">
                {headerLine}
                <span className="personal-badge">MY COPY</span>
              </div>
              {multiplesets && (
                <div className="set-label">Set {setNum}</div>
              )}
              {setSongs.map((song, i) => {
                const defaultNotes = song.notes
                const myNote = personalNotesMap[song.order]

                return (
                  <div key={i} className="song-row">
                    <div className="song-main" style={{ fontSize: songFontSize }}>
                      <div className="song-num" style={{ fontSize: numFontSize }}>{song.order}</div>
                      <div className="song-title" style={{ fontSize: songFontSize }}>{song.title}</div>
                      {song.uses_backing_track && <span className="bt-badge" style={{ fontSize: btFontSize }}>BT</span>}
                      {song.key && <div className="song-key" style={{ fontSize: detailFontSize }}>{song.key}</div>}
                      {defaultNotes && <div className="song-notes" style={{ fontSize: detailFontSize }}>{defaultNotes}</div>}
                    </div>
                    {myNote && (
                      <div className="personal-note" style={{ fontSize: personalNoteFontSize }}>
                        ✏️ {myNote}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </>
  )
}
