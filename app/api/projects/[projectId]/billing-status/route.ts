import { NextResponse } from 'next/server'
import { supabaseSSR } from '@/lib/supabaseSSR'

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params
  const supabase = await supabaseSSR()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ isPro: false })
  }

  const { data } = await supabase
    .from('project_billing')
    .select('plan, status')
    .eq('project_id', projectId)
    .maybeSingle()

  const isPro = data?.plan === 'pro' && data?.status === 'active'

  return NextResponse.json({ isPro })
}