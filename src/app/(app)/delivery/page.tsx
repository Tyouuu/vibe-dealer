import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { daysSince, DELIVERY_STALLED_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { markDelivered } from './actions'

export const metadata: Metadata = {
  title: 'SIM Delivery — DealerHub',
}

type DeliveryRow = {
  id: string
  company_name: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  sim_type: 'physical' | 'esim' | null
  delivery_status: 'na' | 'pending' | 'sent'
}

export default async function DeliveryPage() {
  const user = await requireUser()

  if (user.role !== 'cs' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        Your role ({user.role}) does not have permission to view SIM delivery.
      </div>
    )
  }

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('delivery_queue')
    .select('id, company_name, tx_date, type, package, sim_type, delivery_status')
    .order('tx_date', { ascending: false })

  const typed = (rows ?? []) as DeliveryRow[]

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-zinc-50">🚚 SIM Delivery</h1>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
          {typed.length} items
        </span>
      </div>
      <p className="mb-4 rounded-lg bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
        Physical SIMs ship to the office then to the dealer (shipping cost applies); eSIMs activate instantly, no
        delivery needed.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Dealer</th>
              <th className="px-3 py-2.5">Package</th>
              <th className="px-3 py-2.5">SIM Type</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {typed.map((row) => (
              <tr key={row.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                <td className="px-3 py-2.5 text-zinc-400">{row.tx_date}</td>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{row.company_name}</td>
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
                    (() => {
                      const days = daysSince(row.tx_date)
                      const stalled = days >= DELIVERY_STALLED_DAYS_THRESHOLD
                      return stalled ? (
                        <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400">
                          Pending · {days}d
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                          Pending
                        </span>
                      )
                    })()
                  ) : (
                    <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                      Instant
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.delivery_status === 'pending' ? (
                    <form action={markDelivered}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Mark as Sent
                      </button>
                    </form>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!typed.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No delivery items right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
