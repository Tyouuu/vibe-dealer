import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/service'
import { getReportSummary } from '@/lib/reports/daily-summary'
import { resolveReportPeriod, type ReportFrequency } from '@/lib/reports/report-period'
import { todayInMalaysia } from '@/lib/month'
import { reportToSentry } from '@/lib/sentry-report'

// Both failure paths below return a response instead of throwing, which means
// Next's onRequestError never sees them and Sentry would otherwise hear
// nothing. That matters more here than on a normal route: nobody is watching a
// 00:00 cron. The report would just stop arriving, and the first person to
// notice would be whoever eventually wondered why. reportToSentry (lib/
// sentry-report.ts) is what awaits Sentry.flush before a serverless instance
// can freeze mid-send.

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

function reportHtml(summary: Awaited<ReturnType<typeof getReportSummary>>, title: string) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">Vibe456 — ${title}</h2>
      <p style="color: #666; margin-top: 0;">${summary.date}</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Total Top-up${summary.days > 1 ? ` over ${summary.days} days` : ''}</td>
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

  // Every master, with the frequency each of them chose (0037).
  //
  // Ordered — with 2+ masters, whichever row Postgres happened to return
  // first silently won the "from" name on the shared email before this,
  // with no ordering guarantee (so not even stable day to day). Oldest
  // master account wins now — deterministic, if still somewhat arbitrary
  // with multiple masters.
  const { data: masters } = await supabase
    .from('profiles')
    .select('id, email, report_sender_name, report_frequency')
    .eq('role', 'master')
    .eq('active', true)
    .order('created_at')

  const today = todayInMalaysia()

  // One cron, four preferences. Vercel schedules live in vercel.json and are
  // fixed at build time, so the schedule cannot be a user setting — but which
  // days it actually sends on can be, and that is the part people care about.
  // Grouped by frequency so people on the same schedule still share one email
  // rather than getting one each.
  const groups = new Map<ReportFrequency, { id: string; email: string | null; report_sender_name: string | null }[]>()
  for (const m of masters ?? []) {
    const freq = (m.report_frequency ?? 'daily') as ReportFrequency
    if (!groups.has(freq)) groups.set(freq, [])
    groups.get(freq)!.push(m)
  }

  const fromEmail = process.env.REPORT_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
  const usingSandboxSender = fromEmail.endsWith('@resend.dev')
  const sent: { frequency: string; recipients: string[]; period: string }[] = []
  const skipped: { frequency: string; reason: string }[] = []

  for (const [frequency, members] of groups) {
    const period = resolveReportPeriod(frequency, today)
    if (!period) {
      skipped.push({ frequency, reason: frequency === 'off' ? 'turned off' : 'not a send day' })
      continue
    }

    const recipients = await resolveMasterEmails(supabase, members)
    if (!recipients.length) {
      // Previously a bare 200 "skipped", which Vercel records as a healthy run —
      // the report silently going nowhere looked identical to it being
      // delivered. It means every master row has lost its email, so it's a
      // misconfiguration to fix, not an error the code can recover from.
      await reportToSentry(() =>
        Sentry.captureMessage('Report skipped: no recipients with an email', {
          level: 'warning',
          tags: { cron: 'daily-report' },
          extra: { frequency, masterRows: members.length },
        })
      )
      skipped.push({ frequency, reason: 'no recipients with an email' })
      continue
    }

    // The report goes to everyone on this schedule in one email, so there's
    // only room for one "from" name — the first who's set one wins.
    const senderName = members.find((m) => m.report_sender_name)?.report_sender_name ?? 'Vibe456 Report'

    // The fallback is Resend's shared sandbox domain, which only delivers to
    // the Resend account owner's own address. Fine for one master trying it
    // out and silently wrong the moment a second recipient exists.
    if (usingSandboxSender && recipients.length > 1) {
      await reportToSentry(() =>
        Sentry.captureMessage(
          `Report is still sending from ${fromEmail} (Resend's shared sandbox) to ${recipients.length} recipients — all but the Resend account owner will be refused. Verify a domain and set REPORT_FROM_EMAIL.`,
          { level: 'warning', tags: { cron: 'daily-report' } }
        )
      )
    }

    const title = frequency === 'daily' ? 'Daily Report' : frequency === 'weekly' ? 'Weekly Report' : 'Monthly Report'
    const summary = await getReportSummary(supabase, period)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        to: recipients,
        subject: `Vibe456 ${title} — ${summary.date}`,
        html: reportHtml(summary, title),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      // The most likely real-world trigger isn't an outage: an unverified
      // sender domain. The sender in use is included so the report says which
      // case this is.
      await reportToSentry(() =>
        Sentry.captureException(new Error(`Report email failed: Resend returned ${res.status}`), {
          tags: { cron: 'daily-report' },
          extra: { frequency, status: res.status, from: fromEmail, usingSandboxSender, recipients, resendResponse: body.slice(0, 500) },
        })
      )
      // Carry on to the other groups: one schedule failing must not silently
      // cancel the others.
      skipped.push({ frequency, reason: `Resend returned ${res.status}` })
      continue
    }

    sent.push({ frequency, recipients, period: summary.date })
  }

  // A day on which nobody is due is a normal, healthy outcome — six days in
  // seven for a weekly subscriber — so it is reported as such rather than as
  // an error.
  return NextResponse.json({ status: sent.length ? 'sent' : 'nothing due', sent, skipped })
}
