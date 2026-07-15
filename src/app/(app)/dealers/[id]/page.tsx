import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'
import { markDelivered } from '../../delivery/actions'
import { IconTrendUp, IconCoin } from '../../icons'
import { ConfirmSubmitButton } from '../../confirm-submit-button'

export const metadata: Metadata = {
  title: 'Dealer Details — DealerHub',
}

type Dealer = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  status: 'active' | 'inactive'
}

type TxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
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

const PACKAGE_STYLE: Record<string, string> = {
  A: 'pill-neutral',
  B: 'pill-jade',
  C: 'pill-brass',
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

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function DealerDetailPage({ params }: PageProps) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: dealer } = await supabase
    .from('dealers')
    .select('id, company_name, company_no, contact_person, phone, email, address, region, package, rate, status')
    .eq('id', id)
    .single()

  if (!dealer) {
    notFound()
  }

  const typedDealer = dealer as Dealer
  const activity = (await getDealerActivityMap(supabase)).get(id)
  const isFinance = user.role === 'accountant' || user.role === 'master'

  let txRows: TxRow[] = []
  let deliveryRows: DeliveryRow[] = []
  let rateHistoryRows: RateHistoryRow[] = []
  const rateHistoryNameById = new Map<string, string>()

  if (isFinance) {
    const { data } = await supabase
      .from('transactions')
      .select('id, tx_date, type, package, points, money_rm, rate, commission_rm, delivery_status, status')
      .eq('dealer_id', id)
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
    txRows = (data as TxRow[] | null) ?? []

    const { data: rateHistoryData } = await supabase
      .from('dealer_rate_history')
      .select('id, old_package, old_rate, new_package, new_rate, changed_by, created_at')
      .eq('dealer_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
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

      {activity?.isInactive && (
        <div className="alert alert-warn">{activity.daysSinceLastActivity} days since the last verified top-up.</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="app-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-paper">{typedDealer.company_name}</h1>
              {typedDealer.company_no && <div className="text-[11px] text-paper-dim">{typedDealer.company_no}</div>}
            </div>
            <div className="flex items-center gap-3.5">
              {isFinance && (
                <a href={`/entry?dealer=${id}`} className="text-xs font-semibold text-jade-bright hover:text-jade">
                  + Record Transaction
                </a>
              )}
              <span className={typedDealer.status === 'active' ? 'pill pill-jade' : 'pill pill-neutral'}>
                {typedDealer.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="profile-grid text-sm">
            <div className="profile-field">
              <label>Contact Person</label>
              <div>{typedDealer.contact_person ?? '—'}</div>
            </div>
            <div className="profile-field">
              <label>Phone</label>
              <div>{typedDealer.phone ?? '—'}</div>
            </div>
            <div className="profile-field">
              <label>Email</label>
              <div>{typedDealer.email ?? '—'}</div>
            </div>
            <div className="profile-field">
              <label>Region</label>
              <div>{typedDealer.region ?? '—'}</div>
            </div>
            <div className="profile-field sm:col-span-2">
              <label>Address</label>
              <div>{typedDealer.address ?? '—'}</div>
            </div>
            <div className="profile-field">
              <label>Package / Rate</label>
              <div>
                {typedDealer.package ? (
                  <span className={`pill ${PACKAGE_STYLE[typedDealer.package]}`}>
                    {typedDealer.package} · {typedDealer.rate}%
                  </span>
                ) : (
                  <span className="text-paper-dim/50">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {isFinance ? (
          (() => {
            const verified = txRows.filter((t) => t.status === 'verified')
            const lifetimePoints = verified.reduce((s, t) => s + Number(t.points), 0)
            const lifetimeCommission = verified.reduce((s, t) => s + Number(t.commission_rm), 0)
            return (
              <div className="flex flex-col gap-5">
                <div className="docket-hero">
                  <div className="docket-half">
                    <div className="docket-half-label">
                      <span className="icon-badge icon-badge-jade h-7 w-7">
                        <IconTrendUp className="h-4 w-4" />
                      </span>
                      Lifetime Top-up
                    </div>
                    <div className="figure-points mt-2 text-3xl font-semibold">
                      {lifetimePoints.toLocaleString()} <span className="text-sm font-semibold text-paper-dim">pts</span>
                    </div>
                  </div>
                  <div className="docket-perforation" aria-hidden="true" />
                  <div className="docket-half">
                    <div className="docket-half-label">
                      <span className="icon-badge icon-badge-brass h-7 w-7">
                        <IconCoin className="h-4 w-4" />
                      </span>
                      Commission Earned
                    </div>
                    <div className="figure-money mt-2 text-3xl font-semibold">RM {lifetimeCommission.toLocaleString()}</div>
                  </div>
                </div>

                {txRows.length > 0 && (
                  <div className="app-card">
                    <h3 className="mb-1 text-sm font-bold text-paper">Recent Activity</h3>
                    <div className="flex flex-col">
                      {txRows.slice(0, 6).map((tx) => (
                        <div key={tx.id} className="docket-row">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`timeline-dot ${
                                tx.status === 'verified' ? 'timeline-dot-jade' : tx.status === 'flagged' ? 'timeline-dot-clay' : 'timeline-dot-brass'
                              }`}
                            />
                            <span className="text-sm text-paper">
                              {tx.type === 'package' ? `Package ${tx.package} assigned` : 'Top-up recorded'} ·{' '}
                              <span className="figure-points">{tx.points.toLocaleString()} pts</span>
                            </span>
                          </div>
                          <span className="text-xs text-paper-dim">{tx.tx_date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()
        ) : (
          <div className="app-card flex flex-col items-center justify-center gap-2 text-center text-sm text-paper-dim">
            <span>Financial summary is only visible to accountant and master roles.</span>
          </div>
        )}
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">{isFinance ? 'All Transactions' : 'Delivery History'}</h3>

        {isFinance ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
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
                    <td className="td text-paper-dim">{tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}</td>
                    <td className="td figure-money text-right">RM {tx.money_rm.toLocaleString()}</td>
                    <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                    <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                    <td className="td figure-money text-right">RM {tx.commission_rm.toLocaleString()}</td>
                    <td className="td text-paper-dim">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                    <td className="td">
                      <StatusPill status={tx.status} />
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
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
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
          </div>
        )}
      </div>

      {isFinance && (
        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Rate History</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
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
          </div>
        </div>
      )}
    </div>
  )
}
