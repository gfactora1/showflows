import { Suspense } from 'react'
import PublicCalendarClient from './PublicCalendarClient'

export default async function PublicCalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontFamily: 'sans-serif',
      }}>
        Loading…
      </div>
    }>
      <PublicCalendarClient token={token} />
    </Suspense>
  )
}
