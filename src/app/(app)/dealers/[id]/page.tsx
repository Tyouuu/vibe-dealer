import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'

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

const PACKAGE_STYLE: Record<string, string> = {
  A: 'bg-zinc-500/15 text-zinc-300',
  B: 'bg-emerald-500/15 text-emerald-400',
  C: 'bg-amber-400/15 text-amber-300',
}

const DELIVERY_LABEL: Record<string, string> = {
  na: '—',
  pending: 'Pending',
  sent: 'Sent',
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

  if (isFinance) {
    const { data } = await supabase
      .from('transactions')
      .select('id, tx_date, type, package, points, money_rm, rate, commission_rm, delivery_status, status')
      .eq('dealer_id', id)
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false })
    txRows = (data as TxRow[] | null) ?? []
  } else {
    const { data } = await supabase
      .from('delivery_queue')
      .select('id, tx_date, package, sim_type, delivery_status')
      .eq('dealer_id', id)
      .order('tx_date', { ascending: false })
    deliveryRows = (data as DeliveryRow[] | null) ?? []
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dealers" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
        ← Back to Dealers
      </Link>

      {activity?.isInactive && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/50 px-3.5 py-2.5 text-sm text-amber-300">
          ⚠️ {activity.daysSinceLastActivity} days since the last verified top-up.
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-zinc-50">{typedDealer.company_name}</h1>
            {typedDealer.company_no && <div className="text-[11px] text-zinc-500">{typedDealer.company_no}</div>}
          </div>
          <span
            className={
              typedDealer.status === 'active'
                ? 'rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400'
                : 'rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-xs font-bold text-zinc-400'
            }
          >
            {typedDealer.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-sm md:grid-cols-3">
          <Field label="Contact Person" value={typedDealer.contact_person} />
          <Field label="Phone" value={typedDealer.phone} />
          <Field label="Email" value={typedDealer.email} />
          <Field label="Region" value={typedDealer.region} />
          <Field label="Address" value={typedDealer.address} />
          <div>
            <div className="text-xs text-zinc-500">Package / Rate</div>
            <div className="mt-1">
              {typedDealer.package ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PACKAGE_STYLE[typedDealer.package]}`}
                >
                  {typedDealer.package} · {typedDealer.rate}%
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">
          {isFinance ? '🧾 Transaction History' : '🚚 Delivery History'}
        </h3>

        {isFinance ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">In (RM)</th>
                  <th className="px-3 py-2.5">Out (pts)</th>
                  <th className="px-3 py-2.5">Rate</th>
                  <th className="px-3 py-2.5">Your 2%</th>
                  <th className="px-3 py-2.5">Delivery</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((tx) => (
                  <tr key={tx.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                    <td className="px-3 py-2.5 text-zinc-400">{tx.tx_date}</td>
                    <td className="px-3 py-2.5 text-zinc-300">
                      {tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300">RM{tx.money_rm.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-zinc-300">{tx.points.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-zinc-300">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-amber-300">
                      RM{tx.commission_rm.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          tx.status === 'verified'
                            ? 'rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400'
                            : tx.status === 'flagged'
                              ? 'rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400'
                              : 'rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300'
                        }
                      >
                        {tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!txRows.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
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
                <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Package</th>
                  <th className="px-3 py-2.5">SIM Type</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveryRows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                    <td className="px-3 py-2.5 text-zinc-400">{row.tx_date}</td>
                    <td className="px-3 py-2.5 text-zinc-300">{row.package ? `Package ${row.package}` : '—'}</td>
                    <td className="px-3 py-2.5">
                      {row.sim_type === 'esim' ? (
                        <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                          eSIM
                        </span>
                      ) : (
                        <span className="text-zinc-400">Physical SIM</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.delivery_status === 'sent' ? (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                          Sent
                        </span>
                      ) : row.delivery_status === 'pending' ? (
                        <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                          Pending
                        </span>
                      ) : (
                        <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                          Instant
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!deliveryRows.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                      No delivery items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-zinc-200">{value ?? '—'}</div>
    </div>
  )
}
