import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, DELIVERY_STALLED_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { markDelivered } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { IconInfo } from '../icons'
import { StatusDot } from '../status-dot'

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
          <div className="segmented">
            <a href="/delivery" className={`segmented-btn ${!showAll ? 'active' : ''}`}>
              Show pending only
            </a>
            <a href="/delivery?all=1" className={`segmented-btn ${showAll ? 'active' : ''}`}>
              Show all
            </a>
          </div>
          <span className="pill pill-neutral">{typed.length} items</span>
        </div>
      </div>
      <div className="info-strip">
        <IconInfo className="mt-0.5 h-[15px] w-[15px] shrink-0" />
        <span>
          Physical SIMs ship to the office then to the dealer (shipping cost applies); eSIMs activate instantly, no
          delivery needed.
        </span>
      </div>

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
            {typed.map((row) => {
              const days = row.delivery_status === 'pending' ? daysSince(row.tx_date) : 0
              const warn = row.delivery_status === 'pending' && days >= DELIVERY_WARN_DAYS_THRESHOLD
              const urgent = row.delivery_status === 'pending' && days >= DELIVERY_STALLED_DAYS_THRESHOLD
              const rowClass = `tr-row ${urgent ? 'tr-urgent' : warn ? 'tr-warn' : ''}`
              return (
                <tr key={row.id} className={rowClass}>
                  <td className="td text-paper-dim">{row.tx_date}</td>
                  <td className="td font-semibold text-paper">{row.company_name}</td>
                  <td className="td text-paper-dim">{row.package ? `Package ${row.package}` : '—'}</td>
                  <td className="td">
                    {row.sim_type === 'esim' ? (
                      <span className="pill pill-jade">eSIM</span>
                    ) : (
                      <span className="pill pill-slate">Physical SIM</span>
                    )}
                  </td>
                  <td className="td">
                    {row.delivery_status === 'sent' ? (
                      <StatusDot color="jade-bright" label="Sent" />
                    ) : row.delivery_status === 'pending' ? (
                      <StatusDot
                        color={urgent ? 'clay-bright' : 'brass-bright'}
                        label={warn ? `Pending · ${days}d` : 'Pending'}
                        pulse
                      />
                    ) : (
                      <StatusDot color="slate-bright" label="Instant" />
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
              )
            })}
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
