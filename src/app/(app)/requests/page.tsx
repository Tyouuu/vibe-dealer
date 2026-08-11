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

  return (
    <>
      <PageHeader
        title="Dealer Requests"
        subtitle="What dealers have sent through their own link. Nothing here has touched the ledger — accepting one opens New Transaction with the details filled in, and you still check the bank and save it yourself."
      />

      {error && <div className="alert alert-bad">{error}</div>}
      {rejected && <div className="alert alert-good">Turned down. The dealer can see your reason on their link.</div>}

      <HeroCard
        label="Waiting for you"
        value={String(pending.length)}
        chgSuffix={
          pending.length === 0
            ? 'nothing waiting on you'
            : oldestDays === 0
              ? 'all came in today'
              : `oldest has waited ${oldestDays} day${oldestDays === 1 ? '' : 's'}`
        }
        href="/requests"
        stats={[
          {
            label: 'Top-ups',
            value: String(pending.filter((r) => r.type === 'topup').length),
            href: '/requests',
            sub: 'credit against a transfer',
          },
          {
            label: 'Packages',
            value: String(pending.filter((r) => r.type === 'package').length),
            href: '/requests',
            sub: 'sets their rate on accept',
          },
        ]}
      />

      <div className="index-surface">
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <li key={r.id} className="app-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/dealers/${r.dealer_id}`} className="text-[14px] font-semibold text-paper hover:underline">
                      {r.dealers?.company_name ?? 'Unknown dealer'}
                    </Link>
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
            ))}
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
