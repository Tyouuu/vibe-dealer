import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { todayInMalaysia, previousMonth } from '@/lib/month'
import { decideAlerts, type AlertKind } from '@/lib/alerts'
import { reportToSentry } from '@/lib/sentry-report'
import { runAndStoreSystemChecks } from '@/lib/system-check-run'
import { notifySystemCheck } from '@/lib/push'
import { problemLines } from '@/lib/system-check'

// Sends nothing on a good day.
//
// The daily report goes out whether or not anything happened, which makes it a
// habit rather than a signal, and it follows each master's chosen frequency —
// so someone on 'monthly' would hear about running out of credit up to a month
// late. This is the other half: one pass a day that is silent unless something
// needs a person, so that an email from it always means something.
//
// What it can say, and the reasoning behind each threshold, is in lib/alerts.ts
// with its tests. This file only gathers the facts and posts the mail.

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function emailHtml(alerts: { headline: string; detail: string }[], today: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; color: #16202b;">
      <p style="font-size: 13px; color: #566476; margin: 0 0 18px;">Vibe456 · ${today}</p>
      ${alerts
        .map(
          (a) => `
        <div style="border-left: 3px solid #c8901a; padding: 2px 0 2px 14px; margin: 0 0 20px;">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">${a.headline}</div>
          <div style="font-size: 14px; line-height: 1.55; color: #3d4c5e;">${a.detail.replace(/\n/g, '<br>')}</div>
        </div>`,
        )
        .join('')}
      <p style="font-size: 12px; color: #8a97a6; margin: 26px 0 0; border-top: 1px solid #e4e9ef; padding-top: 14px;">
        You are only sent this when something needs doing. Nothing arrives on a quiet day.
      </p>
    </div>
  `
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = todayInMalaysia()
  // From `today` rather than currentMonth(), which reads the clock again —
  // one read, so a run that straddles midnight cannot chase the wrong month.
  const prevMonth = previousMonth(today.slice(0, 7))

  const [balance, { data: statement }, { count: pendingTotal }, { data: oldestRows }, { data: logRows }, { count: prevMonthCount }] =
    await Promise.all([
    getAvailablePointsBalance(supabase),
    supabase.from('company_statements').select('reconciled').eq('month', `${prevMonth}-01`).maybeSingle(),
    // The count and the oldest date as two small reads. They used to be one read of
    // every pending row, whose length was the count — which stops at 1,000.
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('transactions').select('tx_date').eq('status', 'pending').order('tx_date', { ascending: true }).limit(1),
    supabase.from('alert_log').select('kind, last_sent_on'),
    // head+count, so this asks "was there any trading" without dragging a
    // month of rows back to answer it.
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .gte('tx_date', `${prevMonth}-01`)
      .lt('tx_date', `${today.slice(0, 7)}-01`),
  ])

  // The books checked against their own rules (0058). Run here, once a day, because this is the
  // one pass that already exists to say something only when something is wrong — and it is
  // stored either way, so the System Check page can show that it ran clean and not merely that
  // it did not complain. If the check cannot run, that is itself said: a check that quietly
  // stopped looks exactly like a month with nothing wrong.
  let systemCheck: { ran: boolean; problems: string[] } = { ran: false, problems: [] }
  try {
    const run = await runAndStoreSystemChecks(supabase, { source: 'nightly', runBy: null })
    systemCheck = { ran: true, problems: problemLines(run) }
  } catch (err) {
    await reportToSentry(() => Sentry.captureException(err))
  }

  const oldest = oldestRows?.[0]?.tx_date as string | undefined
  const oldestPendingDays = oldest
    ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 86_400_000)
    : null

  const lastSentOn: Partial<Record<AlertKind, string | null>> = {}
  for (const r of logRows ?? []) lastSentOn[r.kind as AlertKind] = r.last_sent_on as string

  const alerts = decideAlerts(
    {
      availablePoints: balance.available,
      lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
      hasEverPurchased: balance.totalPurchased > 0,
      previousMonth: prevMonth,
      previousMonthReconciled: Boolean(statement?.reconciled),
      previousMonthHadActivity: (prevMonthCount ?? 0) > 0,
      dayOfMonth: Number(today.slice(8, 10)),
      oldestPendingDays,
      pendingCount: pendingTotal ?? 0,
      systemCheck,
    },
    lastSentOn,
    today,
  )

  if (!alerts.length) {
    return NextResponse.json({ ok: true, date: today, sent: 0, note: 'nothing needed saying', systemCheck: { ran: systemCheck.ran, failing: systemCheck.problems.length } })
  }

  // The phone first, and independent of the email that follows: a mail service that is down must not
  // also silence the alert on a phone. Claimed once a day inside notifySystemCheck.
  const systemAlert = alerts.find((a) => a.kind === 'system_check')
  if (systemAlert) await notifySystemCheck({ day: today, headline: systemAlert.headline })

  // Masters and the accountant. Between them they are the people who can
  // actually resolve any of these — the master buys the credit, either of them
  // can verify or reconcile. cs is left out: none of this is theirs to fix and
  // none of it is theirs to see.
  const { data: people } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['master', 'accountant'])
    .eq('active', true)
  const recipients = (people ?? []).map((p) => p.email).filter((e): e is string => Boolean(e))

  if (!recipients.length) {
    await reportToSentry(() =>
      Sentry.captureException(new Error('Alerts cron had something to say and nobody to say it to')),
    )
    return NextResponse.json({ ok: false, date: today, reason: 'no active master or accountant with an email' })
  }

  const fromEmail = process.env.REPORT_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Vibe456 <${fromEmail}>`,
      to: recipients,
      // The subject carries the first headline, because on a phone that is
      // often the only part read — and one of these is usually enough to know
      // whether to open it now or after lunch.
      subject: alerts.length === 1 ? `Vibe456: ${alerts[0].headline}` : `Vibe456: ${alerts[0].headline} (+${alerts.length - 1} more)`,
      html: emailHtml(alerts, today),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    await reportToSentry(() =>
      Sentry.captureException(new Error(`Alert email failed: Resend returned ${res.status}`), {
        extra: { status: res.status, recipients, kinds: alerts.map((a) => a.kind), resendResponse: body.slice(0, 500) },
      }),
    )
    return NextResponse.json({ ok: false, date: today, reason: `Resend returned ${res.status}` }, { status: 502 })
  }

  // Only after it actually went. Recording the send first would mean a failed
  // email still bought three days of silence about a problem nobody heard.
  await supabase
    .from('alert_log')
    .upsert(alerts.map((a) => ({ kind: a.kind, last_sent_on: today, updated_at: new Date().toISOString() })), {
      onConflict: 'kind',
    })

  return NextResponse.json({ ok: true, date: today, sent: alerts.length, kinds: alerts.map((a) => a.kind), recipients, systemCheck: { ran: systemCheck.ran, failing: systemCheck.problems.length } })
}
