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
import { IconMapPin, IconTag, IconUsers } from '../../icons'
import { ConfirmSubmitButton } from '../../confirm-submit-button'
import { Avatar } from '../../avatar'
import { EditDealerButton } from './edit-dealer-button'
import { ScrollFade } from '../../scroll-fade'

export const metadata: Metadata = {
  title: 'Dealer Details — DealerHub',
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

function StatusPill({ status }: { status: 'pending' | 'verified' | 'flagged' }) {
  if (status === 'verified') return <span className="pill pill-jade">Verified</span>
  if (status === 'flagged') return <span className="pill pill-clay">Flagged</span>
  return <span className="pill pill-brass">Pending</span>
}

function SimPill({ simType }: { simType: 'physical' | 'esim' | null }) {
  if (simType === 'esim') return <span className="pill pill-slate">eSIM</span>
  return <span className="text-paper-dim">Physical SIM</span>
}

function DeliveryPill({ status }: { status: 'na' | 'pending' | 'sent' }) {
  if (status === 'sent') return <span className="pill pill-jade">Sent</span>
  if (status === 'pending') return <span className="pill pill-brass">Pending</span>
  return <span className="pill pill-slate">Instant</span>
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
    <div className={`flex items-start justify-between gap-2.5 py-2 text-[12.5px] ${last ? '' : 'border-b border-ink-800'}`}>
      <span className="whitespace-nowrap font-semibold text-paper-dim">{label}</span>
      <span className="text-right font-bold text-paper">{value}</span>
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
        <div className="text-[12.5px] font-bold text-paper">{title}</div>
        <div className="mt-0.5 text-[11.5px] text-paper-dim">{subtitle}</div>
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
        ? 'id, company_name, company_no, contact_person, phone, whatsapp, email, address, region, notes, package, rate, onboarded_by, created_at'
        : 'id, company_name, company_no, contact_person, phone, whatsapp, email, address, region, notes, package, onboarded_by, created_at'
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
      .from('profiles')
      .select('name, email')
      .eq('id', typedDealer.onboarded_by)
      .maybeSingle()
    onboardedByName = onboardedByProfile?.name ?? onboardedByProfile?.email ?? null
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
      .select('id, tx_date, type, package, points, money_rm, rate, commission_rm, coupon_rm, delivery_status, status, flag_reason, note')
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
      ? await supabase.from('profiles').select('id, name, email').in('id', [...changedByIds])
      : { data: [] }
    for (const p of rateProfiles ?? []) {
      rateHistoryNameById.set(p.id, p.name ?? p.email ?? '—')
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

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dealers" className="text-xs font-semibold text-paper-dim hover:text-paper">
        ← Back to Dealers
      </Link>

      {error && <div className="alert alert-bad">{error}</div>}
      {updated && <div className="alert alert-ok">Dealer info updated.</div>}

      {activity?.isInactive && (
        <div className="alert alert-warn">{activity.daysSinceLastActivity} days since the last verified top-up.</div>
      )}

      <div className="app-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={typedDealer.company_name} size={44} />
            <div>
              <h2 className="text-lg font-semibold text-paper">{typedDealer.company_name}</h2>
              {typedDealer.company_no && <div className="mt-0.5 text-xs text-paper-dim">{typedDealer.company_no}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {isFinance && (
              <span className={`pill ${ranking ? (ranking.rank <= 3 ? 'pill-brass' : 'pill-neutral') : 'pill-neutral'}`}>
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
                    Delete Dealer
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
                  Delete Dealer
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
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_296px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {isFinance && txRows.length > 0 && (
            <div className="app-card">
              <h3 className="mb-1 text-sm font-bold text-paper">Recent Activity</h3>
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
                          ? `Adjustment — ${tx.points >= 0 ? '+' : ''}${tx.points.toLocaleString()} pts`
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
            <h3 className="mb-3.5 text-sm font-bold text-paper">{isFinance ? 'All Transactions' : 'Delivery History'}</h3>

            {isFinance ? (
              <ScrollFade label="All transactions for this dealer">
                <table className="w-full min-w-[820px] border-collapse text-sm">
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
                        <td className="td text-paper-dim">{tx.tx_date}</td>
                        <td className="td text-paper-dim">
                          {tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Top-up'}
                          {tx.type === 'topup' && tx.coupon_rm > 0 && (
                            <div className="mt-0.5 text-[10.5px] text-paper-dim">
                              RM {tx.coupon_rm.toLocaleString()} as coupon ({tx.coupon_rm / COUPON_DENOMINATION_RM}×)
                            </div>
                          )}
                        </td>
                        <td className="td figure-money text-right">RM {tx.money_rm.toLocaleString()}</td>
                        <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                        <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                        <td className="td figure-money text-right">RM {tx.commission_rm.toLocaleString()}</td>
                        <td className="td text-paper-dim">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                        <td className="td">
                          <StatusPill status={tx.status} />
                          {tx.status === 'flagged' && tx.flag_reason && (
                            <div className="mt-0.5 max-w-[160px] truncate text-[10.5px] text-paper-dim" title={tx.flag_reason}>
                              {tx.flag_reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!txRows.length && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-paper-dim">
                          No transactions yet.
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
                          <SimPill simType={row.sim_type} />
                        </td>
                        <td className="td">
                          <DeliveryPill status={row.delivery_status} />
                        </td>
                        <td className="td">
                          {row.delivery_status === 'pending' ? (
                            <form action={markDelivered}>
                              <input type="hidden" name="id" value={row.id} />
                              <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this SIM as sent? This cannot be undone.">
                                Mark as Sent
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
              <h3 className="mb-3.5 text-sm font-bold text-paper">Rate History</h3>
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
          <div className="app-card">
            <h3 className="mb-1 text-sm font-bold text-paper">Contact</h3>
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

          {typedDealer.notes && (
            <div className="app-card">
              <h3 className="mb-1.5 text-sm font-bold text-paper">Notes</h3>
              <p className="whitespace-pre-wrap text-[12.5px] text-paper-dim">{typedDealer.notes}</p>
            </div>
          )}

          {isFinance ? (
            (() => {
              const verified = txRows.filter((t) => t.status === 'verified')
              const lifetimePoints = verified.reduce((s, t) => s + Number(t.points), 0)
              const lifetimeCommission = verified.reduce((s, t) => s + Number(t.commission_rm), 0)
              return (
                <div className="rounded-2xl bg-paper p-5 shadow-sm">
                  <h3 className="mb-3.5 text-sm font-bold text-white">Lifetime</h3>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white/50">Lifetime Top-up</div>
                      <div className="mt-0.5 text-xl font-semibold text-white">{lifetimePoints.toLocaleString()} pts</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white/50">Commission Earned</div>
                      <div className="mt-0.5 text-xl font-semibold text-primary">RM {lifetimeCommission.toLocaleString()}</div>
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
