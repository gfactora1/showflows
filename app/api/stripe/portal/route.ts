import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseSSR } from '@/lib/supabaseSSR'
import { supabaseServer } from '@/lib/supabaseServer'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  const supabase = await supabaseSSR()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()

  if (userErr || !user) {
    return jsonError('Unauthorized', 401)
  }

  let body: { projectId: string }
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const { projectId } = body
  if (!projectId) {
    return jsonError('projectId is required', 400)
  }

  // Verify the user is the project owner
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, owner')
    .eq('id', projectId)
    .maybeSingle()

  if (projectErr) return jsonError(projectErr.message, 500)
  if (!project) return jsonError('Project not found', 404)
  if (project.owner !== user.id) return jsonError('Forbidden (owner only)', 403)

  // Get the stripe_customer_id from project_billing
  const admin = supabaseServer()
  const { data: billing, error: billingErr } = await admin
    .from('project_billing')
    .select('stripe_customer_id')
    .eq('project_id', projectId)
    .maybeSingle()

  if (billingErr) return jsonError(billingErr.message, 500)
  if (!billing?.stripe_customer_id) {
    return jsonError('No Stripe customer found for this project', 404)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${appUrl}/`,
  })

  return NextResponse.json({ url: portalSession.url })
}