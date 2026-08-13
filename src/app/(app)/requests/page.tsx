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
      .select('id, dealer_id, type, money_rm, package, note, slip_url, status, reject_reason, transaction_id, decided_at, created_at, transfer_date, paid_from, sim_type, dealers(company_name, rate)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('topup_requests')
      .select('id, dealer_id, type, money_rm, package, note, slip_url, status, reject_reason, transaction_id, decided_at, created_at, transfer_date, paid_from, sim_type, dealers(company_name, rate)')
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
  const amountOf = (r: RequestRow) => (r.type === 'topup' ? Number(r.money_rm ?? 0) : (PACKAGES[r.package as PackageCode]?.price ?? 0))
  const dupeOf = new Map<string, RequestRow>()
  const seen = new Map<string, RequestRow>()
  for (const r of pending) {
    const ref = (r.paid_from ?? '').trim().toLowerCase()
    if (!ref) continue
    const key = `${r.dealer_id}|${amountOf(r)}|${ref}`
    const first = seen.get(key)
    if (first) dupeOf.set(r.id, first)
    else seen.set(key, r)
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
              return (
              <li key={r.id} className={`app-card p-5 ${dupe ? 'border-brass/40 bg-brass/[0.04]' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/dealers/${r.dealer_id}`} className="text-[14px] font-semibold text-paper hover:underline">
                      {r.dealers?.company_name ?? 'Unknown dealer'}
                    </Link>
                    {dupe && <span className="pill pill-brass ml-2 align-middle">Looks like a repeat</span>}
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
