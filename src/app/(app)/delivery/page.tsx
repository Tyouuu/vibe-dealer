import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { daysSince, DELIVERY_STALLED_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { markDelivered } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'

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

type PageProps = {
  searchParams: Promise<{ all?: string }>
}

export default async function DeliveryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { all } = await searchParams
  const showAll = all === '1'

  if (user.role !== 'cs' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view SIM delivery.</div>
  }

  const supabase = await createClient()
  let query = supabase
    .from('delivery_queue')
    .select('id, company_name, tx_date, type, package, sim_type, delivery_status')
    .order('tx_date', { ascending: false })

  if (!showAll) {
    query = query.eq('delivery_status', 'pending')
  }

  const { data: rows } = await query

  const typed = (rows ?? []) as DeliveryRow[]

  return (
    <div className="app-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-paper">SIM Delivery</h1>
        <div className="flex items-center gap-3">
          <a href={showAll ? '/delivery' : '/delivery?all=1'} className="text-xs font-semibold text-paper-dim hover:text-paper">
            {showAll ? 'Show pending only' : 'Show all'}
          </a>
          <span className="pill pill-neutral">{typed.length} items</span>
        </div>
      </div>
      <p className="mb-4 rounded-md bg-ink-850/60 px-3.5 py-2.5 text-xs leading-relaxed text-paper-dim">
        Physical SIMs ship to the office then to the dealer (shipping cost applies); eSIMs activate instantly, no
        delivery needed.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Dealer</th>
              <th className="th">Package</th>
              <th className="th">SIM Type</th>
              <th className="th">Status</th>
              <th className="th">Action</th>
            </tr>
          </thead>
          <tbody>
            {typed.map((row) => (
              <tr key={row.id} className="tr-row">
                <td className="td text-paper-dim">{row.tx_date}</td>
                <td className="td font-semibold text-paper">{row.company_name}</td>
                <td className="td text-paper-dim">{row.package ? `Package ${row.package}` : '—'}</td>
                <td className="td">
                  {row.sim_type === 'esim' ? (
                    <span className="pill pill-slate">eSIM</span>
                  ) : (
                    <span className="text-paper-dim">Physical SIM</span>
                  )}
                </td>
                <td className="td">
                  {row.delivery_status === 'sent' ? (
                    <span className="pill pill-jade">Sent</span>
                  ) : row.delivery_status === 'pending' ? (
                    (() => {
                      const days = daysSince(row.tx_date)
                      const stalled = days >= DELIVERY_STALLED_DAYS_THRESHOLD
                      return stalled ? (
                        <span className="pill pill-clay">Pending · {days}d</span>
                      ) : (
                        <span className="pill pill-brass">Pending</span>
                      )
                    })()
                  ) : (
                    <span className="pill pill-slate">Instant</span>
                  )}
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
            {!typed.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-paper-dim">
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
