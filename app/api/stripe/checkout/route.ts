import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseSSR } from '@/lib/supabaseSSR'

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
    .select('id, owner, name')
    .eq('id', projectId)
    .maybeSingle()

  if (projectErr) return jsonError(projectErr.message, 500)
  if (!project) return jsonError('Project not found', 404)
  if (project.owner !== user.id) return jsonError('Forbidden (owner only)', 403)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO_ANNUAL!,
        quantity: 1,
      },
    ],
    customer_email: user.email,
    metadata: {
      projectId,
      userId: user.id,
    },
    subscription_data: {
      metadata: {
        projectId,
        userId: user.id,
      },
      trial_period_days: 14,
    },
    success_url: `${appUrl}/projects/${projectId}/upgrade?success=true`,
    cancel_url: `${appUrl}/projects/${projectId}/upgrade?canceled=true`,
  })

  return NextResponse.json({ url: session.url })
}