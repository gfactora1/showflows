import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: import('stripe').Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  const admin = supabaseServer()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as import('stripe').Stripe.Checkout.Session

    const projectId = session.metadata?.projectId
    const userId = session.metadata?.userId
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    if (!projectId || !userId) {
      console.error('Missing metadata in checkout session')
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const oneYearFromNow = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString()

    let periodStart = nowIso
    let periodEnd = oneYearFromNow

    // Try to get accurate period dates from the subscription
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const rawStart = (subscription as any).current_period_start
      const rawEnd = (subscription as any).current_period_end

      if (typeof rawStart === 'number' && rawStart > 0) {
        periodStart = new Date(rawStart * 1000).toISOString()
      }
      if (typeof rawEnd === 'number' && rawEnd > 0) {
        periodEnd = new Date(rawEnd * 1000).toISOString()
      }
    } catch (subErr: any) {
      console.warn('Could not retrieve subscription dates, using defaults:', subErr.message)
    }

    const { error: upsertErr } = await admin.from('project_billing').upsert(
      {
        project_id: projectId,
        billing_owner_user_id: userId,
        plan: 'pro',
        status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'project_id' }
    )

    if (upsertErr) {
      console.error('Failed to upsert project_billing:', upsertErr.message)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    console.log(`✅ Project ${projectId} upgraded to Pro`)
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as import('stripe').Stripe.Subscription

    const projectId = subscription.metadata?.projectId

    if (!projectId) {
      console.error('Missing projectId in subscription metadata')
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const { error: updateErr } = await admin
      .from('project_billing')
      .update({
        plan: 'free',
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)

    if (updateErr) {
      console.error('Failed to downgrade project_billing:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    console.log(`Project ${projectId} downgraded to Free`)
  }

  return NextResponse.json({ received: true })
}
