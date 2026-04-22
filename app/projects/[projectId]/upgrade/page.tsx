'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function UpgradeContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  if (success) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          Welcome to ShowFlows Pro!
        </h1>
        <p style={{ opacity: 0.7, marginBottom: 32, lineHeight: 1.6 }}>
          Your project has been upgraded. Conflict intelligence is now active —
          ShowFlows will start catching problems before they happen.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <a
            href={`/projects/${projectId}/conflicts`}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: '#111',
              color: 'white',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open Conflict Intelligence →
          </a>
          <a
            href="/"
            style={{ fontSize: 13, opacity: 0.6, textDecoration: 'none', color: '#111' }}
          >
            ← Back to projects
          </a>
        </div>
      </div>
    )
  }

  if (canceled) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          No worries — you're still on Free
        </h1>
        <p style={{ opacity: 0.7, marginBottom: 32, lineHeight: 1.6 }}>
          You canceled before completing checkout. Your project is still active
          and you can upgrade anytime.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#111',
            color: 'white',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          ← Back to projects
        </a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Upgrade to ShowFlows Pro
      </h1>
      <p style={{ opacity: 0.7, marginBottom: 32, lineHeight: 1.6 }}>
        Get conflict intelligence, double-booking detection, missing role alerts,
        and advanced operational protection for your shows.
      </p>
      <p style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>$150 / year</p>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 32 }}>
        14-day free trial — no credit card required upfront
      </p>
      <a
        href="/"
        style={{ fontSize: 13, opacity: 0.6, textDecoration: 'none', color: '#111' }}
      >
        ← Back to projects
      </a>
    </div>
  )
}

export default function UpgradePage({
  params,
}: {
  params: { projectId: string }
}) {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <UpgradeContent projectId={params.projectId} />
    </Suspense>
  )
}
