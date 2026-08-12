import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'
import { getDealerRankingMap } from '@/lib/dealer-ranking'
import { COUPON_DENOMINATION_RM } from '@/lib/packages'
import { markDelivered } from '../../delivery/actions'
import { deleteDealer } from '../actions'
import { IconMapPin, IconPaperclip, IconTag, IconUsers } from '../../icons'
import { ConfirmSubmitButton } from '../../confirm-submit-button'
import { Avatar } from '../../avatar'
import { StatusDot } from '../../status-dot'
import { EditDealerButton } from './edit-dealer-button'
import { SubmitLink } from './submit-link'
import { ScrollFade } from '../../scroll-fade'
import { formatMYR } from '@/lib/money'
import { HeroCard } from '../../hero-card'
import { formatDateLabel } from '@/lib/month'
import { siteOrigin } from '@/lib/site-url'
import { cardsOwedByDealer } from '@/lib/sim-stock'

export const metadata: Metadata = {
  title: 'Dealer Details — Vibe456',
}

type Dealer = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  region: string | null
  notes: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  onboarded_by: string | null
  created_at: string | null
  submit_token: string | null
}

type TxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  coupon_rm: number
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
  flag_reason: string | null
  note: string | null
  receipt_url: string | null
}

type DeliveryRow = {
  id: string
  tx_date: string
  package: string | null
  sim_type: 'physical' | 'esim' | null
  delivery_status: 'na' | 'pending' | 'sent'
}

type RateHistoryRow = {
  id: string
  old_package: string | null
  old_rate: number | null
  new_package: string | null
  new_rate: number | null
  changed_by: string | null
  created_at: string
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DELIVERY_LABEL: Record<string, string> = {
  na: '—',
  pending: 'Pending',
  sent: 'Sent',
}

// These three were local copies of a vocabulary the rest of the app already
// had. Every other page renders a transaction's status with the shared
// StatusDot — a coloured dot and a word, with pending pulsing. Here the same
// three statuses were pills, and pending did not pulse, so clicking a dealer
// name in Transactions changed how the identical status looked mid-click.
// SimPill was worse than inconsistent: it gave eSIM a pill and physical plain
// text, so one column had some rows in a container and some not.
function TxStatus({ status }: { status: 'pending' | 'verified' | 'flagged' }) {
  if (status === 'verified') return <StatusDot color="jade-bright" label="Verified" />
  if (status === 'flagged') return <StatusDot color="clay-bright" label="Flagged" />
  return <StatusDot color="brass-bright" label="Pending" pulse />
}

function DeliveryStatus({ status }: { status: 'na' | 'pending' | 'sent' }) {
  if (status === 'sent') return <StatusDot color="jade-bright" label="Sent" />
  if (status === 'pending') return <StatusDot color="brass-bright" label="Pending" pulse />
  return <StatusDot color="slate-bright" label="Instant" />
}

function AttrChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-800 bg-ink-850 px-3 py-1.5 text-xs font-semibold text-paper">
      <span className="text-paper-dim">{icon}</span>
      {label} · <b>{value}</b>
    </span>
  )
}

function RailField({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-2.5 py-2 text-[12px] ${last ? '' : 'border-b border-ink-800'}`}>
      <span className="whitespace-nowrap font-semibold text-paper-dim">{label}</span>
      <span className="text-right font-semibold text-paper">{value}</span>
    </div>
  )
}

const TIMELINE_TONE = {
  jade: 'border-jade-bright text-jade-bright',
  clay: 'border-clay-bright text-clay-bright',
  brass: 'border-brass-bright text-brass-bright',
  primary: 'border-primary text-primary',
} as const

function Timeline({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col pl-0.5">
      <div className="absolute bottom-1.5 left-[14.25px] top-1.5 w-px bg-ink-800" />
      {children}
    </div>
  )
}

function TimelineItem({
  tone,
  icon,
  title,
  subtitle,
}: {
  tone: keyof typeof TIMELINE_TONE
  icon: 'check' | 'x' | 'tag' | 'edit'
  title: string
  subtitle: string
}) {
  return (
    <div className="relative flex gap-3.5 py-2.5">
      <span className={`z-10 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-[1.5px] bg-ink-900 ${TIMELINE_TONE[tone]}`}>
        {icon === 'check' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        {icon === 'x' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        )}
        {icon === 'tag' && <IconTag className="h-3.5 w-3.5" />}
        {icon === 'edit' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        )}
      </span>
      <div className="flex-1 pt-0.5">
        <div className="text-[12px] font-semibold text-paper">{title}</div>
        <div className="mt-0.5 text-[12px] text-paper-dim">{subtitle}</div>
      </div>
    </div>
  )
}

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; updated?: string }>
}

export default async function DealerDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { error, updated } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  // cs has no SELECT on the dealers base table (0015 — rate is a commission
  // figure PROJECT_SPEC.md says cs must never see) — read through
  // dealers_directory instead, which has every column except rate.
  const isFinance = user.role === 'accountant' || user.role === 'master'
  // Roster management (edit profile, status, import) is cs/master, same
  // split as onboarding — not the finance role split above.
  const canManage = user.role === 'cs' || user.role === 'master'
  const { data: dealer } = await supabase
    .from(isFinance ? 'dealers' : 'dealers_directory')
    .select(
      isFinance
        ? 'id, company_name, company_no, contact_person, phone, whatsapp, email, address, region, notes, package, rate, onboarded_by, created_at, submit_token'
        : 'id, company_name, company_no, contact_person, phone, whatsapp, email, address, region, notes, package, onboarded_by, created_at, submit_token'
    )
    .eq('id', id)
    .single()

  if (!dealer) {
    notFound()
  }

  const typedDealer = { rate: null, onboarded_by: null, created_at: null, ...(dealer as object) } as Dealer

  let onboardedByName: string | null = null
  if (typedDealer.onboarded_by) {
    const { data: onboardedByProfile } = await supabase
      .from('staff_directory')
      .select('display_name')
      .eq('id', typedDealer.onboarded_by)
      .maybeSingle()
    onboardedByName = onboardedByProfile?.display_name ?? null
  }
  const activity = (await getDealerActivityMap(supabase)).get(id)
  // Same RLS boundary as the transactions query below — cs has no SELECT on
  // transactions at all, so ranking (derived from it) is finance-only too.
  const ranking = isFinance ? (await getDealerRankingMap(supabase)).get(id) : undefined

  let txRows: TxRow[] = []
  let deliveryRows: DeliveryRow[] = []
  let rateHistoryRows: RateHistoryRow[] = []
  const rateHistoryNameById = new Map<string, string>()

  if (isFinance) {
    // No .limit() — the sidebar's Lifetime Top-up/Commission figures are a
    // real sum over txRows below, and the table above them is genuinely
    // titled "All Transactions". A cap here would silently under-count both
    // for any dealer who outlives it, with no indicator that either was
    // ever truncated.
    const { data } = await supabase
      .from('transactions')
      .select('id, tx_date, type, package, points, money_rm, rate, commission_rm, coupon_rm, delivery_status, status, flag_reason, note, receipt_url')
      .eq('dealer_id', id)
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false })
    txRows = (data as TxRow[] | null) ?? []

    const { data: rateHistoryData } = await supabase
      .from('dealer_rate_history')
      // No .limit() — same reasoning as the transactions query above: this
      // table exists specifically as an audit trail, so silently dropping
      // older rows for a long-lived dealer would defeat its own purpose.
      .select('id, old_package, old_rate, new_package, new_rate, changed_by, created_at')
      .eq('dealer_id', id)
      .order('created_at', { ascending: false })
    rateHistoryRows = (rateHistoryData as RateHistoryRow[] | null) ?? []

    // changed_by is a bare uuid column with no FK to profiles (same reason as
    // recorded_by / verified_by on transactions — see 0001_profiles_and_rls.sql),
    // so PostgREST nested-select can't join it. Resolve names ourselves.
    const changedByIds = new Set<string>()
    for (const row of rateHistoryRows) {
      if (row.changed_by) changedByIds.add(row.changed_by)
    }
    const { data: rateProfiles } = changedByIds.size
      ? await supabase.from('staff_directory').select('id, display_name').in('id', [...changedByIds])
      : { data: [] }
    for (const p of rateProfiles ?? []) {
      rateHistoryNameById.set(p.id, p.display_name ?? '—')
    }
  } else {
    const { data } = await supabase
      .from('delivery_queue')
      .select('id, tx_date, package, sim_type, delivery_status')
      .eq('dealer_id', id)
      .order('tx_date', { ascending: false })
    deliveryRows = (data as DeliveryRow[] | null) ?? []
  }

  const rateHistoryDisplayName = (changedBy: string | null) => (changedBy ? (rateHistoryNameById.get(changedBy) ?? '—') : '—')

  // Lifetime figures used to be computed 300 lines further down, inside the
  // last card on the page. "What is this dealer worth to us" is the question
  // this page exists to answer, so it's hoisted to the top; the footer card
  // now reads these same values instead of recomputing them.
  const verifiedTx = txRows.filter((t) => t.status === 'verified')
  const lifetimePoints = verifiedTx.reduce((sum, t) => sum + Number(t.points), 0)
  const lifetimeCommission = verifiedTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  // Cards this dealer bought inside a package against cards they have been
  // given. Every role sees it: a quantity is not a price, and the person most
  // likely to be asked "where are the rest of my SIM cards" is cs.
  const { data: simOrderRows } = await supabase
    .from(isFinance ? 'sim_orders' : 'sim_orders_directory')
    .select('dealer_id, quantity')
    .eq('dealer_id', id)
  //
  // The package rows come from whichever source this role can actually read:
  // finance has `transactions`, cs has only `delivery_queue` (0015). Reading
  // the finance table for both would leave cs looking at a confident zero.
  const packageRowsForCards = isFinance
    ? txRows.filter((t) => t.type === 'package' && t.status !== 'flagged').map((t) => ({ dealer_id: id, package: t.package }))
    : deliveryRows.filter((d) => d.package).map((d) => ({ dealer_id: id, package: d.package }))
  const cards = cardsOwedByDealer(
    packageRowsForCards,
    (simOrderRows as { dealer_id: string; quantity: number }[] | null) ?? []
  ).byDealer.get(id) ?? { entitled: 0, delivered: 0, owed: 0 }

  // Extracted so the same markup can be the hero's record header for
  // finance roles and a standalone card for cs, which never sees the
  // hero at all (it carries commission figures). Previously this was a
  // second card *below* the hero, so the page opened with a number and
  // only then said whose number it was. Attio, Salesforce and HubSpot
  // all lead a record page with the record itself.
  const identityHeader = (
    <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={typedDealer.company_name} size={44} />
              <div>
                <h2 className="text-lg font-semibold text-paper">{typedDealer.company_name}</h2>
                {typedDealer.company_no && <div className="mt-0.5 text-xs text-paper-dim">{typedDealer.company_no}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {/* pill-neutral, never pill-brass. A rank is a position, not a
                  state — and pill-brass draws the amber that means "pending"
                  on every other page, so a top-three dealer read as a
                  transaction waiting to be verified. It also made this the one
                  chip among eight StatusDots, which is the mixed-status-
                  treatment the audit flags: measured here as "2 status
                  treatments: chip + dot" at both 1440px and 390px.
                  The dealer list already reached this conclusion and fixed its
                  own RankBadge the same way; this page was missed. Top three
                  are still distinguished, by weight. */}
              {isFinance && (
                <span
                  className={`pill pill-neutral ${ranking && ranking.rank <= 3 ? 'font-semibold text-paper' : ''}`}
                  title={ranking ? `#${ranking.rank} by cumulative top-up` : undefined}
                >
                  {ranking ? `#${ranking.rank} by top-up` : 'No top-up yet'}
                </span>
              )}
              {canManage && (
                <EditDealerButton
                  dealer={{
                    id,
                    company_name: typedDealer.company_name,
                    company_no: typedDealer.company_no,
                    contact_person: typedDealer.contact_person,
                    phone: typedDealer.phone,
                    whatsapp: typedDealer.whatsapp,
                    email: typedDealer.email,
                    address: typedDealer.address,
                    region: typedDealer.region,
                    notes: typedDealer.notes,
                  }}
                />
              )}
              {isFinance && (
                <a href={`/entry?dealer=${id}`} className="btn-primary py-1.5 text-xs">
                  + Record Transaction
                </a>
              )}
              {user.role === 'master' &&
                isFinance &&
                (txRows.length === 0 ? (
                  <form action={deleteDealer}>
                    <input type="hidden" name="id" value={id} />
                    <ConfirmSubmitButton
                      className="btn-clay py-1.5 text-xs"
                      confirmMessage={`Delete ${typedDealer.company_name}? This dealer has no transactions, so this can't affect any financial record — but the deletion itself cannot be undone.`}
                    >
                      Delete dealer
                    </ConfirmSubmitButton>
                  </form>
                ) : (
                  // Same button, always present, so it never reads as "some
                  // dealers just don't have this option" — disabled with the
                  // reason on hover instead of silently disappearing once a
                  // dealer has real transaction history to lose.
                  <button
                    type="button"
                    disabled
                    className="btn-clay cursor-not-allowed py-1.5 text-xs opacity-40"
                    title="Only a dealer with zero transactions can be deleted — this one has real history, so deleting it isn't offered."
                  >
                    Delete dealer
                  </button>
                ))}
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <AttrChip icon={<IconMapPin className="h-3 w-3" />} label="Region" value={typedDealer.region ?? '—'} />
            <AttrChip
              icon={<IconTag className="h-3 w-3" />}
              label="Package"
              value={typedDealer.package ? (isFinance ? `${typedDealer.package} · ${typedDealer.rate}%` : typedDealer.package) : '—'}
            />
            <AttrChip icon={<IconUsers className="h-3 w-3" />} label="Contact" value={typedDealer.contact_person ?? '—'} />
          </div>
    </>
  )

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dealers" className="text-xs font-semibold text-paper-dim hover:text-paper">
        ← Back to dealers
      </Link>

      {error && <div className="alert alert-bad">{error}</div>}
      {updated && <div className="alert alert-ok">Dealer info updated.</div>}

      {activity?.isInactive && (
        <div className="alert alert-warn">{activity.daysSinceLastActivity} days since the last verified top-up.</div>
      )}

      {isFinance && (
        <HeroCard
          header={identityHeader}
          label="Lifetime top-up"
          value={`${lifetimePoints.toLocaleString()} pts`}
          chgSuffix={
            activity?.daysSinceLastActivity == null
              ? 'no verified top-up on record yet'
              : `last verified ${activity.daysSinceLastActivity} day${activity.daysSinceLastActivity === 1 ? '' : 's'} ago`
          }
          href={`/records?dealer=${id}&status=verified`}
          stats={[
            {
              label: 'Your 2% from them',
              value: formatMYR(lifetimeCommission),
              href: `/records?dealer=${id}&status=verified`,
              sub: 'verified transactions only',
            },
            {
              label: 'Verified transactions',
              value: String(verifiedTx.length),
              href: `/records?dealer=${id}&status=verified`,
              sub: `${txRows.length} recorded in total`,
            },
            {
              label: 'Rank by top-up',
              value: ranking ? `#${ranking.rank}` : '—',
              href: '/dealers',
              sub: ranking ? 'across all dealers' : 'nothing recorded yet',
            },
          ]}
        />
      )}

      {/* cs never sees the hero, so for that role the record header
          still renders on its own. */}
      {!isFinance && <div className="app-card">{identityHeader}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_296px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {isFinance && txRows.length > 0 && (
            <div className="app-card">
              <h3 className="mb-1 text-sm font-semibold text-paper">Recent Activity</h3>
              <Timeline>
                {txRows.slice(0, 6).map((tx) => (
                  <TimelineItem
                    key={tx.id}
                    tone={
                      tx.status === 'flagged'
                        ? 'clay'
                        : tx.status === 'pending'
                          ? 'brass'
                          : tx.type === 'adjustment'
                            ? 'brass'
                            : tx.type === 'package'
                              ? 'primary'
                              : 'jade'
                    }
                    icon={tx.status === 'flagged' ? 'x' : tx.type === 'adjustment' ? 'edit' : tx.type === 'package' ? 'tag' : 'check'}
                    title={
                      tx.status === 'flagged'
                        ? 'Flagged'
                        : tx.type === 'adjustment'
                          ? `Correction — ${tx.points >= 0 ? '+' : ''}${tx.points.toLocaleString()} pts`
                          : tx.type === 'package'
                            ? `Package ${tx.package} assigned`
                            : `Top-up recorded — ${tx.points.toLocaleString()} pts`
                    }
                    subtitle={tx.status === 'flagged' ? (tx.flag_reason ?? tx.tx_date) : tx.type === 'adjustment' ? (tx.note ?? tx.tx_date) : tx.tx_date}
                  />
                ))}
              </Timeline>
            </div>
          )}

          <div className="app-card">
            <h3 className="mb-3.5 text-sm font-semibold text-paper">{isFinance ? 'All Transactions' : 'Delivery History'}</h3>

            {isFinance ? (
              <ScrollFade label="All transactions for this dealer">
                {/* 720, not 820. The dealer page is two columns, so this table lives in a
                        772px well at 1440 — an 820px minimum meant it scrolled sideways on a
                        full desktop and the column pushed out of view was Status, on the page
                        someone opens precisely to check a transaction. */}
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Type</th>
                      <th className="th text-right">In (RM)</th>
                      <th className="th text-right">Out (pts)</th>
                      <th className="th text-right">Rate</th>
                      <th className="th text-right">Your 2%</th>
                      <th className="th">Delivery</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map((tx) => (
                      <tr key={tx.id} className="tr-row">
                        <td className="td text-paper-dim">{formatDateLabel(tx.tx_date)}</td>
                        <td className="td text-paper-dim">
                          {tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Correction' : 'Top-up'}
                          {tx.type === 'topup' && tx.coupon_rm > 0 && (
                            <div className="mt-0.5 text-[11px] text-paper-dim">
                              {formatMYR(tx.coupon_rm)} as coupon ({tx.coupon_rm / COUPON_DENOMINATION_RM}×)
                            </div>
                          )}
                          {/* Same link as the Transactions table. This is the
                              page someone lands on when a dealer queries a
                              charge, so it is the one that most needs it. */}
                          {tx.receipt_url && (
                            <a
                              href={`/api/receipts/view?path=${encodeURIComponent(tx.receipt_url)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-paper-dim hover:text-jade-bright"
                            >
                              <IconPaperclip className="h-3 w-3" />
                              Receipt
                            </a>
                          )}
                        </td>
                        <td className="td figure-money text-right">{formatMYR(tx.money_rm)}</td>
                        <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                        <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                        <td className="td figure-money text-right">{formatMYR(tx.commission_rm)}</td>
                        <td className="td text-paper-dim">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                        <td className="td">
                          <TxStatus status={tx.status} />
                          {tx.status === 'flagged' && tx.flag_reason && (
                            <div className="mt-0.5 max-w-[160px] truncate text-[11px] text-paper-dim" title={tx.flag_reason}>
                              {tx.flag_reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* A dealer with nothing on record is not an error state,
                        it is a dealer whose first sale has not happened — so
                        this says the one thing someone standing here would
                        want to do next, aimed at this dealer. It was a single
                        grey line, which also left the transactions column
                        126px shorter than the contact panel beside it on
                        every one of the 284 dealers imported so far. */}
                    {!txRows.length && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center">
                          <p className="text-[13px] font-semibold text-paper">No transactions yet</p>
                          <p className="mx-auto mt-1 max-w-[380px] text-[12px] leading-relaxed text-paper-dim">
                            Everything this dealer buys — packages and top-ups — will appear here, newest first.
                          </p>
                          {isFinance && (
                            <Link href={`/entry?dealer=${id}`} className="btn-ghost mt-4 inline-flex">
                              Record their first transaction
                            </Link>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollFade>
            ) : (
              <ScrollFade label="Delivery history for this dealer">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Package</th>
                      <th className="th">SIM Type</th>
                      <th className="th">Status</th>
                      <th className="th">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryRows.map((row) => (
                      <tr key={row.id} className="tr-row">
                        <td className="td text-paper-dim">{row.tx_date}</td>
                        <td className="td text-paper-dim">{row.package ? `Package ${row.package}` : '—'}</td>
                        <td className="td">
                          <span className="text-paper-dim">{row.sim_type === 'esim' ? 'eSIM' : 'Physical SIM'}</span>
                        </td>
                        <td className="td">
                          <DeliveryStatus status={row.delivery_status} />
                        </td>
                        <td className="td">
                          {row.delivery_status === 'pending' ? (
                            <form action={markDelivered}>
                              <input type="hidden" name="id" value={row.id} />
                              <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this SIM as sent? This cannot be undone.">
                                Mark as sent
                              </ConfirmSubmitButton>
                            </form>
                          ) : (
                            <span className="text-paper-dim/50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!deliveryRows.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                          No delivery items yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollFade>
            )}
          </div>

          {isFinance && (
            <div className="app-card">
              <h3 className="mb-3.5 text-sm font-semibold text-paper">Rate History</h3>
              <ScrollFade label="Rate change history">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">Time</th>
                      <th className="th">Before</th>
                      <th className="th">After</th>
                      <th className="th">Changed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHistoryRows.map((row) => {
                      const before = row.old_package ? `${row.old_package} · ${row.old_rate}%` : '—'
                      const after = row.new_package ? `${row.new_package} · ${row.new_rate}%` : '—'
                      return (
                        <tr key={row.id} className="tr-row">
                          <td className="td text-paper-dim">{formatDateTime(row.created_at)}</td>
                          <td className="td text-paper-dim">{before}</td>
                          <td className="td text-paper">{after}</td>
                          <td className="td text-paper-dim">{rateHistoryDisplayName(row.changed_by)}</td>
                        </tr>
                      )
                    })}
                    {!rateHistoryRows.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-paper-dim">
                          No rate changes yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollFade>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-5">
          {/* First in the rail, above even the contact details. Sending a
              dealer their link is the most common reason anyone opens this
              page now, and it used to sit below the transaction history and
              the SIM panel — far enough down that the owner could not find
              it. */}
          {typedDealer.submit_token && (
            <SubmitLink
              origin={await siteOrigin()}
              token={typedDealer.submit_token}
              companyName={typedDealer.company_name}
              whatsapp={typedDealer.whatsapp ?? typedDealer.phone}
            />
          )}

          <div className="app-card">
            <h3 className="mb-1 text-sm font-semibold text-paper">Contact</h3>
            <div className="mt-2.5">
              <RailField label="Contact Person" value={typedDealer.contact_person ?? '—'} />
              <RailField label="Phone" value={typedDealer.phone ?? '—'} />
              <RailField label="WhatsApp" value={typedDealer.whatsapp ?? typedDealer.phone ?? '—'} />
              <RailField label="Email" value={typedDealer.email ?? '—'} />
              <RailField label="Address" value={typedDealer.address ?? '—'} />
              <RailField label="Onboarded By" value={onboardedByName ?? '—'} />
              <RailField label="Onboarded On" value={typedDealer.created_at ? formatDateTime(typedDealer.created_at) : '—'} last />
            </div>
          </div>

          {/* Only once they have bought something that came with cards. A
              dealer with no package has no entitlement, and an empty card
              panel on 242 of 284 dealer pages is noise. */}
          {cards.entitled > 0 && (
            <div className="app-card">
              <h3 className="mb-1 text-sm font-semibold text-paper">SIM cards</h3>
              <p className="text-[12px] leading-relaxed text-paper-dim">
                What their packages entitle them to, against what has actually gone out.
              </p>
              <div className="mt-2.5">
                <RailField label="From packages" value={`${cards.entitled.toLocaleString()} cards`} />
                <RailField label="Sent so far" value={`${cards.delivered.toLocaleString()} cards`} />
                <RailField label="Still owed" value={cards.owed > 0 ? `${cards.owed.toLocaleString()} cards` : 'None'} last />
              </div>
              {cards.owed > 0 && (
                <p className="mt-2.5 text-[12px]" style={{ color: 'var(--color-brass-bright)' }}>
                  They have paid for {cards.owed.toLocaleString()} more cards than they have been given.
                </p>
              )}
            </div>
          )}

          {typedDealer.notes && (
            <div className="app-card">
              <h3 className="mb-1.5 text-sm font-semibold text-paper">Notes</h3>
              <p className="whitespace-pre-wrap text-[12px] text-paper-dim">{typedDealer.notes}</p>
            </div>
          )}

          {isFinance ? (
            (() => {
              return (
                <div className="rounded-2xl bg-paper p-5 shadow-sm">
                  <h3 className="mb-3.5 text-sm font-semibold text-white">Lifetime</h3>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white/50">Lifetime Top-up</div>
                      <div className="mt-0.5 text-xl font-semibold text-white">{lifetimePoints.toLocaleString()} pts</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white/50">Commission Earned</div>
                      {/* Was text-primary — an accent on a figure is decoration;
                          the accent's contrast on this dark surface was also
                          borderline. Money reads as ink, like its sibling. */}
                      <div className="mt-0.5 text-xl font-semibold text-white">{formatMYR(lifetimeCommission)}</div>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="app-card text-center text-sm text-paper-dim">Financial summary is only visible to accountant and master roles.</div>
          )}
        </aside>
      </div>
    </div>
  )
}
