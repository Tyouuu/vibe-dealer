import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getYesterdaySummary } from '@/lib/reports/daily-summary'

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
      <h2 style="margin-bottom: 4px;">DealerHub — Daily Report</h2>
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
    supabase.from('profiles').select('id, email, report_sender_name').eq('role', 'master'),
    getYesterdaySummary(supabase),
  ])

  const recipients = await resolveMasterEmails(supabase, masters ?? [])

  if (!recipients.length) {
    return NextResponse.json({ status: 'skipped', reason: 'no master recipients' })
  }

  // The report goes to every master in one email, so there's only room for
  // one "from" name — the first master who's set one wins. Falls back to a
  // fixed default when nobody has customized it.
  const senderName = masters?.find((m) => m.report_sender_name)?.report_sender_name ?? 'DealerHub Daily Report'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <onboarding@resend.dev>`,
      to: recipients,
      subject: `DealerHub Daily Report — ${summary.date}`,
      html: reportHtml(summary),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ error: 'Resend request failed', detail: body }, { status: 502 })
  }

  return NextResponse.json({ status: 'sent', recipients, summary })
}
