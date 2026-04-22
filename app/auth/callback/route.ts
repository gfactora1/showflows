// app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function safeNextPath(input: string | null) {
  // Allow only relative paths within the app
  if (!input) return '/'
  if (!input.startsWith('/')) return '/'
  return input
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNextPath(url.searchParams.get('next'))

  if (!code) {
    const redirectUrl = new URL('/', url.origin)
    redirectUrl.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(redirectUrl)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const redirectUrl = new URL('/', url.origin)
    redirectUrl.searchParams.set('error', 'auth_exchange_failed')
    return NextResponse.redirect(redirectUrl)
  }

  // Optional: add a hint flag when returning to an invite page
  if (next.startsWith('/invite/')) {
    const redirectUrl = new URL(next, url.origin)
    redirectUrl.searchParams.set('from', 'login')
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}