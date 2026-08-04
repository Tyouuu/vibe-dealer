import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/service'
import { getYesterdaySummary } from '@/lib/reports/daily-summary'

// Both failure paths below return a response instead of throwing, which means
// Next's onRequestError never sees them and Sentry would otherwise hear
// nothing. That matters more here than on a normal route: nobody is watching a
// 00:00 cron. The report would just stop arriving, and the first person to
// notice would be whoever eventually wondered why.
//
// flush() is the other half. On a serverless function the runtime can freeze
// the instance the moment the response is returned, before Sentry's queued
// event has been sent — so the report is awaited rather than fired off.
async function reportToSentry(capture: () => void) {
  try {
    capture()
    await Sentry.flush(2000)
  } catch {
    // Monitoring must never be the reason the cron itself fails.
  }
}

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const provided = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

// profiles.email is a hand-maintained copy of the real Supabase Auth email
// (there's no signup flow — profiles are created manually, see
// supabase/migrations/0001_profiles_and_rls.sql). If whoever created a
// master's profile row left it blank, fall back to the Auth record instead
// of silently dropping that recipient from the daily report.
async function resolveMasterEmails(
  supabase: SupabaseClient,
  masters: { id: string; email: string | null }[]
): Promise<string[]> {
  const emails: string[] = []
  for (const m of masters) {
    if (m.email) {
      emails.push(m.email)
      continue
    }
    const { data } = await supabase.auth.admin.getUserById(m.id)
    if (data.user?.email) emails.push(data.user.email)
  }
  return emails
}

// mostActiveDealer.name is free text (dealers.company_name, insertable by
// cs on onboarding/import) landing raw in an HTML email sent to every
// master — unescaped, a crafted dealer name could inject a phishing link or
// tracking pixel into a mail clients trusts as an internal system notice.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function reportHtml(summary: Awaited<ReturnType<typeof getYesterdaySummary>>) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">Vibe456 — Daily Report</h2>
      <p style="color: #666; margin-top: 0;">${summary.date}</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Total Top-up</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${summary.points.toLocaleString()} pts</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Your 2%</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">RM${summary.commission.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Most Active Dealer</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${summary.mostActiveDealer?.name ? escapeHtml(summary.mostActiveDealer.name) : '—'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">Pending Review</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${summary.pendingCount}</td>
        </tr>
      </table>
    </div>
  `
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const [{ data: masters }, summary] = await Promise.all([
    // Ordered — with 2+ masters, whichever row Postgres happened to return
    // first silently won the "from" name on the shared email before this,
    // with no ordering guarantee (so not even stable day to day). Oldest
    // master account wins now — deterministic, if still somewhat arbitrary
    // with multiple masters.
    supabase.from('profiles').select('id, email, report_sender_name').eq('role', 'master').order('created_at'),
    getYesterdaySummary(supabase),
  ])

  const recipients = await resolveMasterEmails(supabase, masters ?? [])

  if (!recipients.length) {
    // Previously a bare 200 "skipped", which Vercel records as a healthy run —
    // the report silently going nowhere looked identical to it being
    // delivered. It means every master row has lost its email, so it's a
    // misconfiguration to fix, not an error the code can recover from.
    await reportToSentry(() =>
      Sentry.captureMessage('Daily report skipped: no master recipients', {
        level: 'warning',
        tags: { cron: 'daily-report' },
        extra: { masterRows: masters?.length ?? 0 },
      })
    )
    return NextResponse.json({ status: 'skipped', reason: 'no master recipients' })
  }

  // The report goes to every master in one email, so there's only room for
  // one "from" name — the first master who's set one wins. Falls back to a
  // fixed default when nobody has customized it.
  const senderName = masters?.find((m) => m.report_sender_name)?.report_sender_name ?? 'Vibe456 Daily Report'

  // The address the report is sent from, once a real domain is verified in
  // Resend. It stays configurable rather than hardcoded because the value is
  // deployment-specific, not code: a preview deploy and production can point
  // at different senders without a commit.
  //
  // The fallback is Resend's shared sandbox domain, which only delivers to the
  // Resend account owner's own address. That is fine for one master trying it
  // out and silently wrong the moment a second recipient exists — so it warns
  // rather than failing, and the Sentry report below names it explicitly when
  // a send does fail.
  const fromEmail = process.env.REPORT_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
  const usingSandboxSender = fromEmail.endsWith('@resend.dev')
  if (usingSandboxSender && recipients.length > 1) {
    await reportToSentry(() =>
      Sentry.captureMessage(
        `Daily report is still sending from ${fromEmail} (Resend's shared sandbox) to ${recipients.length} recipients — all but the Resend account owner will be refused. Verify a domain and set REPORT_FROM_EMAIL.`,
        { level: 'warning', tags: { cron: 'daily-report' } }
      )
    )
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${fromEmail}>`,
      to: recipients,
      subject: `Vibe456 Daily Report — ${summary.date}`,
      html: reportHtml(summary),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    // The most likely real-world trigger isn't an outage: an unverified
    // sender domain. Resend's shared sandbox address only delivers to the
    // Resend account owner, so adding a second master — or moving the existing
    // one to a company address — starts failing here. The sender in use is
    // included below so the report says which case this is.
    await reportToSentry(() =>
      Sentry.captureException(new Error(`Daily report email failed: Resend returned ${res.status}`), {
        tags: { cron: 'daily-report' },
        // Recipients are the point of the alert (which address was refused),
        // and no report content is included.
        extra: { status: res.status, from: fromEmail, usingSandboxSender, recipients, resendResponse: body.slice(0, 500) },
      })
    )
    return NextResponse.json({ error: 'Resend request failed', detail: body }, { status: 502 })
  }

  return NextResponse.json({ status: 'sent', recipients, summary })
}
