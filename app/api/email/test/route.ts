import { Resend } from 'resend'

export async function POST() {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: 'ShowFlows <onboarding@resend.dev>',
      to: ['gfactora@technologyblvd.com'],
      subject: 'ShowFlows test email',
      html: `<p>If you received this, Resend is connected successfully.</p>`,
    })

    if (error) {
      return Response.json({ ok: false, error }, { status: 500 })
    }

    return Response.json({ ok: true, data })
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}