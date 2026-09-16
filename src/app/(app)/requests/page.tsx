import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { formatMYR } from '@/lib/money'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { daysSince } from '@/lib/dealer-activity'
import { formatDateLabel } from '@/lib/month'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { IconPaperclip, IconTag } from '../icons'
import { RejectForm } from './reject-form'
import { ReadSlipButton } from './read-slip-button'
import { compareSlip } from '@/lib/slip-extract'

export const metadata: Metadata = {
  title: 'Dealer Requests — Vibe456',
}

type PageProps = {
  searchParams: Promise<{ error?: string; rejected?: string }>
}

type RequestRow = {
  id: string
  dealer_id: string
  type: 'topup' | 'package'
  money_rm: string | number | null
  package: PackageCode | null
  note: string | null
  slip_url: string | null
  status: 'pending' | 'accepted' | 'rejected'
  reject_reason: string | null
  transaction_id: string | null
  decided_at: string | null
  created_at: string
  transfer_date: string | null
  paid_from: string | null
  sim_type: 'physical' | 'esim' | null
  // What the attached slip itself says, once somebody has had it read (0046).
  // slip_read_at set with slip_read_error null means the read succeeded, even
  // if every field came back null — the model looked and found nothing.
  slip_amount_rm: string | number | null
  slip_paid_on: string | null
  slip_bank: string | null
  slip_reference: string | null
  slip_read_at: string | null
  slip_read_error: string | null
  dealers: { company_name: string; rate: number | null } | null
}

// One label/value pair from the request. Inline rather than stacked: three of
// these have to fit a phone without pushing Accept below the fold.
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-paper-dim">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-paper" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * How far apart two requests are — from each other, not from today.
 *
 * First cut reached for daysSince(), which answers "how long ago was this",
 * so two requests three minutes apart both sent yesterday came out as "1 days
 * earlier". The gap is the whole signal here: three minutes apart is a
 * double-tap, three days apart is probably two real payments, and the reader
 * decides differently in each case.
 */
function gapBetween(earlierIso: string, laterIso: string): string {
  const mins = Math.max(0, Math.round((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 60000))
  if (mins < 1) return 'moments'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

function whenInMalaysia(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, rejected } = await searchParams

  // Accepting one records money, so this is the same pair who may use /entry.
  // cs sees no amounts anywhere else and sees none here.
  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="review dealer requests" />
  }

  const supabase = await createClient()
  const [{ data: pendingRows }, { data: decidedRows }] = await Promise.all([
    supabase
      .from('topup_requests')
      .select('id, dealer_id, type, money_rm, package, note, slip_url, status, reject_reason, transaction_id, decided_at, created_at, transfer_date, paid_from, sim_type, slip_amount_rm, slip_paid_on, slip_bank, slip_reference, slip_read_at, slip_read_error, dealers(company_name, rate)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('topup_requests')
      .select('id, dealer_id, type, money_rm, package, note, slip_url, status, reject_reason, transaction_id, decided_at, created_at, transfer_date, paid_from, sim_type, slip_amount_rm, slip_paid_on, slip_bank, slip_reference, slip_read_at, slip_read_error, dealers(company_name, rate)')
      .neq('status', 'pending')
      .order('decided_at', { ascending: false })
      .limit(10),
  ])

  // Oldest first above: a queue is read by what has waited longest, and that
  // is also the one a dealer is sitting there wondering about.
  const pending = (pendingRows ?? []) as unknown as RequestRow[]
  const decided = (decidedRows ?? []) as unknown as RequestRow[]
  const oldestDays = pending.length ? daysSince(pending[0].created_at.slice(0, 10)) : 0

  // Which of these is probably the same payment sent twice.
  //
  // The guard already exists — findRecentDuplicate on /entry blocks a second
  // transaction for the same dealer and the same amount inside the window —
  // so money cannot actually go in twice. What it cannot do is speak before
  // you have decided: you accept the first, fill in New Transaction, save,
  // come back, accept the second, and only then does anything object. The
  // wasted trip is the whole cost, and it is about to get more common: every
  // dealer submits from a phone now, and a phone is where you double-tap.
  //
  // Three signals, all three required — same dealer, same amount, same bank
  // reference. Two dealers can transfer RM 500 on the same day and that is
  // not a duplicate; the same dealer sending the same amount with the same
  // reference twice is one payment described twice. Requiring the reference
  // is what keeps this from crying wolf on a dealer who genuinely tops up
  // twice in a week.
  //
  // The FIRST of a pair is left unmarked. It is the one that is probably
  // real; marking both would say "one of these two is wrong" and leave the
  // reader to work out which.
  //
  // The reference is taken off the SLIP when the slip has been read, and only
  // falls back to what the dealer typed when it has not. That swap is the
  // whole reason 0046 exists: paid_from is a free-text line the dealer fills
  // in, so a mistyped, blank or deliberately varied reference walked straight
  // past this check. The number printed on the transfer slip is not theirs to
  // vary.
  const amountOf = (r: RequestRow) => (r.type === 'topup' ? Number(r.money_rm ?? 0) : (PACKAGES[r.package as PackageCode]?.price ?? 0))
  //
  // Every reference a row HAS, not the best one it has. First cut took the
  // slip's reference when there was one and fell back to the typed line
  // otherwise — which broke the check the moment one of a pair had been read
  // and the other had not: the read row keyed on `slip:778812345`, its twin
  // on `typed:maybank 3:15pm...`, no shared key, no warning. Reading one
  // receipt made a duplicate invisible, which is the opposite of the point.
  // A row registers under both and matches on either.
  const keysOf = (r: RequestRow) => {
    const parts: string[] = []
    const fromSlip = (r.slip_reference ?? '').replace(/\D/g, '')
    if (fromSlip.length >= 4) parts.push(`slip:${fromSlip}`)
    const typed = (r.paid_from ?? '').trim().toLowerCase()
    if (typed) parts.push(`typed:${typed}`)
    return parts.map((p) => `${r.dealer_id}|${amountOf(r)}|${p}`)
  }
  const dupeOf = new Map<string, RequestRow>()
  const seen = new Map<string, RequestRow>()
  for (const r of pending) {
    const keys = keysOf(r)
    const first = keys.map((k) => seen.get(k)).find(Boolean)
    if (first) dupeOf.set(r.id, first)
    for (const k of keys) if (!seen.has(k)) seen.set(k, r)
  }

  // The pair the check above cannot see: same dealer, same bank reference,
  // but a DIFFERENT amount — because amountOf(r) is baked into every key
  // above, two requests for the same transfer are invisible to each other
  // the moment one of them has a typo in it. That is exactly the case worth
  // surfacing, not excluding: a dealer who sends RM300 by mistake and then
  // resends the same reference as RM3,000 has told you which one is wrong,
  // but only if something points both requests out together.
  const referenceKeysOf = (r: RequestRow) => {
    const parts: string[] = []
    const fromSlip = (r.slip_reference ?? '').replace(/\D/g, '')
    if (fromSlip.length >= 4) parts.push(`slip:${fromSlip}`)
    const typed = (r.paid_from ?? '').trim().toLowerCase()
    if (typed) parts.push(`typed:${typed}`)
    return parts.map((p) => `${r.dealer_id}|${p}`)
  }
  const correctionOf = new Map<string, RequestRow>()
  const seenByRef = new Map<string, RequestRow>()
  for (const r of pending) {
    const keys = referenceKeysOf(r)
    const differentAmount = keys.map((k) => seenByRef.get(k)).find((match) => match && amountOf(match) !== amountOf(r))
    // Not layered on top of an exact repeat — that pair already has its own
    // alert, and showing both would say two contradictory things about the
    // same two rows.
    if (differentAmount && !dupeOf.has(r.id)) correctionOf.set(r.id, differentAmount)
    for (const k of keys) if (!seenByRef.has(k)) seenByRef.set(k, r)
  }

  return (
    <>
      <PageHeader
        title="Dealer Requests"
        subtitle="What dealers have sent through their own link. Nothing here has touched the ledger — accepting one opens New Transaction with the details filled in, and you still check the bank and save it yourself."
      />

      {error && <div className="alert alert-bad">{error}</div>}
      {rejected && <div className="alert alert-good">Turned down. The dealer can see your reason on their link.</div>}

      {/* No stats row under the figure.
          =================================================================
          It printed "Top-ups 2 / Packages 0" below a hero reading "2", which
          is the total restated as its own parts — 2 = 2 + 0 — in a block that
          doubled the card's height and pushed the first actual request below
          the fold. With a number you can count on one hand, the split is a
          clause, not a panel. Reconciliation has said its one number and one
          sentence this way since the client called that page finished. */}
      <HeroCard
        label="Waiting for you"
        value={String(pending.length)}
        chgSuffix={[
          pending.length === 0
            ? 'nothing waiting on you'
            : (() => {
                const topups = pending.filter((r) => r.type === 'topup').length
                const packages = pending.length - topups
                if (packages === 0) return pending.length === 1 ? 'a top-up' : 'all top-ups'
                if (topups === 0) return pending.length === 1 ? 'a package' : 'all packages'
                return `${topups} top-up${topups === 1 ? '' : 's'}, ${packages} package${packages === 1 ? '' : 's'}`
              })(),
          pending.length === 0 ? null : oldestDays === 0 ? 'all came in today' : `oldest has waited ${oldestDays} day${oldestDays === 1 ? '' : 's'}`,
          dupeOf.size > 0 ? `${dupeOf.size} look${dupeOf.size === 1 ? 's' : ''} like a repeat` : null,
          correctionOf.size > 0 ? `${correctionOf.size} ${correctionOf.size === 1 ? 'has' : 'have'} a mismatched amount` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        href="/requests"
      />

      <div className="index-surface">
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => {
              const dupe = dupeOf.get(r.id)
              const correction = correctionOf.get(r.id)
              return (
              <li key={r.id} className={`app-card p-5 ${dupe || correction ? 'border-brass/40 bg-brass/[0.04]' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/dealers/${r.dealer_id}`} className="text-[14px] font-semibold text-paper hover:underline">
                      {r.dealers?.company_name ?? 'Unknown dealer'}
                    </Link>
                    {dupe && <span className="pill pill-brass ml-2 align-middle">Looks like a repeat</span>}
                    {correction && <span className="pill pill-brass ml-2 align-middle">Different amount, same reference</span>}
                    <p className="mt-0.5 text-[13px] text-paper-dim">{whenInMalaysia(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-semibold tabular-nums text-paper">
                      {r.type === 'topup' ? formatMYR(Number(r.money_rm ?? 0)) : `RM${PACKAGES[r.package as PackageCode]?.price ?? '—'}`}
                    </p>
                    <p className="inline-flex items-center gap-1 text-[12px] text-paper-dim">
                      <IconTag className="h-3 w-3" />
                      {r.type === 'topup' ? 'Top-up' : `Package ${r.package}`}
                    </p>
                  </div>
                </div>

                {/* What the dealer told us, laid out so accepting needs no
                    further questions. Anything they left blank is left out
                    rather than rendered as a dash — an empty row is a fact
                    nobody has, and printing four of them buries the two that
                    do. */}
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
                  {r.transfer_date && <Fact label="Transferred" value={formatDateLabel(r.transfer_date)} />}
                  {r.paid_from && <Fact label="From" value={r.paid_from} />}
                  {r.sim_type && <Fact label="SIM" value={r.sim_type === 'esim' ? 'eSIM' : 'Physical cards'} />}
                </dl>

                {r.note && <p className="mt-3 rounded-lg bg-ink-850/60 px-3 py-2 text-[13px] leading-relaxed text-paper">{r.note}</p>}

                {/* What the slip itself says.
                    =========================================================
                    Only rendered once somebody has pressed Read the slip —
                    an unread request looks exactly as it did before, because
                    a row of empty slip fields would imply the check ran and
                    found nothing.

                    Findings first and in words, then the raw reading. A
                    reviewer who sees "Slip says RM 500 — the request is for
                    RM 5,000" needs no further explanation; one who sees only
                    two numbers side by side has to do the subtraction. */}
                {r.slip_read_at && (
                  <div className="mt-3">
                    {r.slip_read_error ? (
                      <p className="text-[12px] text-paper-dim">
                        The slip could not be read
                        {r.slip_read_error === 'service unavailable' ? ' — the AI service was unavailable, not the picture.' : ' — open the image and check it yourself.'}
                      </p>
                    ) : (
                      <>
                        {(() => {
                          const findings = compareSlip(
                            {
                              amountRm: amountOf(r),
                              paidFrom: r.paid_from,
                              transferDate: r.transfer_date,
                              submittedAt: r.created_at,
                            },
                            {
                              amount_rm: r.slip_amount_rm == null ? null : Number(r.slip_amount_rm),
                              paid_on: r.slip_paid_on,
                              bank: r.slip_bank,
                              reference: r.slip_reference,
                              recipient: null,
                            },
                          )
                          if (!findings.length) return null
                          // One block, not one box per finding. Three stacked
                          // full-width alerts for a single request read as
                          // three separate emergencies and filled half the
                          // card with tint; the disagreements are one fact
                          // about one slip, so they get one object, toned by
                          // the worst of them and ordered with the money
                          // first.
                          const worst = findings.some((f) => f.tone === 'bad') ? 'alert-bad' : 'alert-warn'
                          const ordered = [...findings].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1))
                          return (
                            <div className={`alert ${worst} mb-2 block text-[13px]`}>
                              <p className="font-semibold">The slip does not match this request</p>
                              <ul className="mt-1.5 flex flex-col gap-1">
                                {ordered.map((f) => (
                                  <li key={f.kind} className="flex gap-2">
                                    <span aria-hidden="true">·</span>
                                    <span>{f.text}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })()}
                        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
                          {r.slip_amount_rm != null && <Fact label="Slip amount" value={formatMYR(Number(r.slip_amount_rm))} />}
                          {r.slip_paid_on && <Fact label="Slip date" value={formatDateLabel(r.slip_paid_on)} />}
                          {r.slip_bank && <Fact label="Slip bank" value={r.slip_bank} />}
                          {r.slip_reference && <Fact label="Slip ref" value={r.slip_reference} />}
                          {r.slip_amount_rm == null && !r.slip_paid_on && !r.slip_bank && !r.slip_reference && (
                            <span className="text-paper-dim">Nothing legible on the slip — open the image and check it yourself.</span>
                          )}
                        </dl>
                      </>
                    )}
                  </div>
                )}

                {/* Says what matched, not just that something did. "Looks
                    like a repeat" on its own is a machine's opinion; naming
                    the three things that are identical lets the reader
                    overrule it in a second — which they should be able to,
                    because two genuine payments of the same size with the
                    same reference are possible, just unlikely. Nothing is
                    blocked here: both buttons stay exactly as they are. */}
                {dupe && (
                  <div className="alert alert-warn mt-3 text-[13px]">
                    Same dealer, same amount and same bank reference as the request sent at{' '}
                    <b className="font-semibold">{whenInMalaysia(dupe.created_at)}</b>, {gapBetween(dupe.created_at, r.created_at)} earlier. Check the bank for two payments
                    before accepting both.
                  </div>
                )}

                {correction && (
                  <div className="alert alert-warn mt-3 text-[13px]">
                    Same dealer and the same bank reference as the request sent at{' '}
                    <b className="font-semibold">{whenInMalaysia(correction.created_at)}</b>, but for{' '}
                    <b className="font-semibold">{formatMYR(amountOf(correction))}</b> instead of{' '}
                    <b className="font-semibold">{formatMYR(amountOf(r))}</b>. One of the two is likely a typo — check which
                    before accepting either.
                  </div>
                )}

                {/* The one thing that stops this being a two-click accept. A
                    top-up cannot be priced without a rate, and 233 dealers
                    have none on file — so the link takes the request anyway
                    (see r/[token]/actions.ts) and the work lands here, named,
                    with the page that fixes it one tap away. */}
                {r.type === 'topup' && r.dealers?.rate == null && (
                  <div className="alert alert-warn mt-3 text-[13px]">
                    This dealer has no package or rate on file, so their points cannot be worked out yet.{' '}
                    <Link href={`/dealers/${r.dealer_id}`} className="font-semibold underline">
                      Set their package first
                    </Link>
                    , then come back and accept this.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
                  {/* A link, not a button. Accepting means recording a
                      transaction, and the only place that happens is /entry —
                      where the balance check, the period lock and the
                      duplicate warning all live. */}
                  <Link href={`/entry?request=${r.id}`} className="btn-primary py-1.5 text-xs">
                    Accept and record
                  </Link>
                  <RejectForm id={r.id} />
                  {r.slip_url && (
                    <a
                      href={`/api/receipts/view?path=${encodeURIComponent(r.slip_url)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-paper-dim hover:text-paper hover:underline"
                    >
                      <IconPaperclip className="h-3.5 w-3.5" />
                      Payment slip
                    </a>
                  )}
                  {/* Beside the link to the image, not instead of it. Reading
                      it is the shortcut; opening it is still how you settle
                      an argument with what was read. */}
                  {r.slip_url && <ReadSlipButton requestId={r.id} alreadyRead={!!r.slip_read_at} />}
                  {/* Quiet, not an alert — attaching a slip is optional and
                      the form says so, so most requests are expected to arrive
                      this way. The point is only that "no slip" and "slip not
                      checked yet" used to look identical: both rendered
                      nothing here. Named plainly instead of left blank, so the
                      absence is a fact you were told rather than one you have
                      to notice on your own. */}
                  {!r.slip_url && <span className="text-[12px] text-paper-dim">No slip attached — check the bank directly.</span>}
                </div>
              </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-800 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-850 text-paper-dim">
              <IconTag className="h-5 w-5" />
            </span>
            <p className="text-sm text-paper-dim">No dealer requests waiting.</p>
            <p className="max-w-sm text-[13px] text-paper-dim">
              Every dealer has their own link. Send it from the arrow beside their name on{' '}
              <Link href="/dealers" className="font-semibold text-paper hover:underline">
                Dealers
              </Link>
              , or from the top of their own page, and what they send lands here.
            </p>
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="app-card mt-6 p-5">
          <h2 className="text-[14px] font-semibold text-paper">Recently handled</h2>
          <ul className="mt-3 flex flex-col divide-y divide-ink-800">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-paper">
                    {r.dealers?.company_name ?? 'Unknown dealer'} ·{' '}
                    {r.type === 'topup' ? formatMYR(Number(r.money_rm ?? 0)) : `Package ${r.package}`}
                  </p>
                  {r.reject_reason && <p className="text-[12px] text-paper-dim">{r.reject_reason}</p>}
                </div>
                {r.status === 'accepted' && r.transaction_id ? (
                  <Link href="/records" className="shrink-0 text-[13px] font-semibold text-jade hover:underline">
                    Recorded
                  </Link>
                ) : (
                  <span className={`shrink-0 text-[13px] font-semibold ${r.status === 'accepted' ? 'text-jade' : 'text-clay-bright'}`}>
                    {r.status === 'accepted' ? 'Recorded' : 'Turned down'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
