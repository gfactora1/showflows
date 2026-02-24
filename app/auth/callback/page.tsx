'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      // Supabase will parse the URL and set the session automatically
      await supabase.auth.getSession()
      router.replace('/')
    }
    run()
  }, [router])

  return (
    <main style={{ padding: 24 }}>
      <p>Signing you in…</p>
    </main>
  )
}