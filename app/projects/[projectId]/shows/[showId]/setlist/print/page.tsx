import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import PrintButton from './PrintButton'

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

function getFontSizes(totalSongs: number) {
  if (totalSongs <= 8) return { title: 26, meta: 14, setHeader: 13, songTitle: 22, songDetail: 14, padding: 10 }
  if (totalSongs <= 12) return { title: 24, meta: 13, setHeader: 12, songTitle: 18, songDetail: 13, padding: 8 }
  if (totalSongs <= 18) return { title: 22, meta: 12, setHeader: 11, songTitle: 15, songDetail: 12, padding: 6 }
  return { title: 20, meta: 11, setHeader: 10, songTitle: 13, songDetail: 11, padding: 5 }
}

export default async function SetlistPrintPage({ params }: Props) {
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

  const { data: setlist } = await supabase.from('setlists').select('songs').eq('show_id', showId).maybeSingle()
  const songs: Song[] = (setlist?.songs ?? []) as Song[]

  const totalSongs = songs.length
  const fs = getFontSizes(totalSongs)

  // Group by set
  const songsBySet = songs.reduce((acc, song) => {
    const setNum = song.set || 1
    if (!acc[setNum]) acc[setNum] = []
    acc[setNum].push(song)
    return acc
  }, {} as Record<number, Song[]>)

  const setNumbers = Object.keys(songsBySet).map(Number).sort((a, b) => a - b)
  const multiplesets = setNumbers.length > 1

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: white;
      color: black;
      padding: 32px 40px;
    }
    .header {
      border-bottom: 3px solid black;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .show-title {
      font-size: ${fs.title}px;
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .show-meta {
      font-size: ${fs.meta}px;
      color: #333;
      line-height: 1.5;
    }
    .set-header {
      font-size: ${fs.setHeader}px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #555;
      padding: ${fs.padding}px 0 4px 0;
      border-bottom: 2px solid #333;
      margin-bottom: 2px;
      margin-top: 14px;
    }
    .set-header:first-child { margin-top: 0; }
    .song-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: ${fs.padding}px 0;
      border-bottom: 1px solid #e0e0e0;
      line-height: 1.3;
    }
    .song-num {
      font-size: ${fs.songDetail}px;
      font-weight: 700;
      color: #aaa;
      min-width: 24px;
      text-align: right;
      flex-shrink: 0;
    }
    .song-title {
      font-size: ${fs.songTitle}px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .bt-badge {
      display: inline-block;
      font-size: ${Math.max(fs.songDetail - 2, 9)}px;
      font-weight: 800;
      background: #111;
      color: white;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
      vertical-align: middle;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .song-key {
      font-size: ${fs.songDetail}px;
      font-weight: 600;
      color: #333;
      flex-shrink: 0;
    }
    .song-notes {
      font-size: ${fs.songDetail - 1}px;
      color: #666;
      font-style: italic;
      flex: 1;
    }
    .song-count {
      margin-top: 16px;
      font-size: ${fs.meta}px;
      color: #aaa;
      text-align: right;
    }
    .no-songs {
      font-size: 18px;
      color: #888;
      margin-top: 24px;
      font-style: italic;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 20px 28px; }
      .song-row { break-inside: avoid; }
      .set-header { break-after: avoid; }
    }
  `

  return (
    <>
      <style>{css}</style>
      <PrintButton />

      <div className="header">
        <div className="show-title">{show.title}</div>
        <div className="show-meta">
          {venueName && <div>{venueName}</div>}
          <div>{formatShowDate(show.starts_at)}</div>
        </div>
      </div>

      {songs.length === 0 ? (
        <div className="no-songs">No songs added to this setlist yet.</div>
      ) : (
        <>
          {setNumbers.map((setNum) => (
            <div key={setNum}>
              {multiplesets && (
                <div className="set-header">Set {setNum}</div>
              )}
              {songsBySet[setNum].map((song, i) => (
                <div key={i} className="song-row">
                  <div className="song-num">{song.order}</div>
                  <div className="song-title">{song.title}</div>
                  {song.uses_backing_track && <span className="bt-badge">BT</span>}
                  {song.key && <div className="song-key">{song.key}</div>}
                  {song.notes && <div className="song-notes">{song.notes}</div>}
                </div>
              ))}
            </div>
          ))}
          <div className="song-count">{totalSongs} song{totalSongs !== 1 ? 's' : ''}</div>
        </>
      )}
    </>
  )
}
