import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, DELIVERY_STALLED_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { IconInfo, IconTruck } from '../icons'
import { DeliveryTable } from './delivery-table'
import { PageHeader } from '../page-header'

export const metadata: Metadata = {
  title: 'SIM Delivery — DealerHub',
}

type RawDeliveryRow = {
  id: string
  company_name: string
  address: string | null
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  sim_type: 'physical' | 'esim' | null
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
}

type PageProps = {
  searchParams: Promise<{ all?: string }>
}

export default async function DeliveryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { all } = await searchParams
  const showAll = all === '1'

  if (user.role !== 'cs' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view SIM delivery" />
  }

  const supabase = await createClient()
  // A flagged transaction is disputed/wrong until someone resolves it — it
  // never belongs in the "please ship this" queue (this SIM might get
  // corrected or reversed), so it's excluded here regardless of which tab
  // is showing, not just filtered out of "pending only". A merely-pending
  // (not yet verified) transaction is fine to prep/ship — the accountant
  // verifying it later is a paperwork step, not a gate on physically
  // handing over a card that's already been sold.
  let query = supabase
    .from('delivery_queue')
    .select('id, company_name, address, tx_date, type, package, sim_type, delivery_status, status')
    .neq('status', 'flagged')
    .order('tx_date', { ascending: false })

  if (!showAll) {
    query = query.eq('delivery_status', 'pending')
  }

  const { data: rows } = await query

  const typed = (rows ?? []) as RawDeliveryRow[]
  const deliveryRows = typed.map((row) => {
    const days = row.delivery_status === 'pending' ? daysSince(row.tx_date) : 0
    return {
      ...row,
      days,
      warn: row.delivery_status === 'pending' && days >= DELIVERY_WARN_DAYS_THRESHOLD,
      urgent: row.delivery_status === 'pending' && days >= DELIVERY_STALLED_DAYS_THRESHOLD,
    }
  })

  const pendingRows = deliveryRows.filter((r) => r.delivery_status === 'pending')
  const oldestDays = pendingRows.reduce((m, r) => Math.max(m, r.days), 0)

  return (
    <>
      <PageHeader
        title="SIM Delivery"
        subtitle={`${pendingRows.length} pending${oldestDays ? ` · oldest is ${oldestDays}d old` : ''}`}
      />

      <div className="app-card">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-3">
          <div className="segmented">
            <Link href="/delivery" className={`segmented-btn ${!showAll ? 'active' : ''}`}>
              Show pending only
            </Link>
            <Link href="/delivery?all=1" className={`segmented-btn ${showAll ? 'active' : ''}`}>
              Show all
            </Link>
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

      {deliveryRows.length ? (
        <DeliveryTable rows={deliveryRows} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-800 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-850 text-paper-dim">
            <IconTruck className="h-5 w-5" />
          </span>
          <p className="text-sm text-paper-dim">{showAll ? 'No delivery items yet.' : 'No pending SIM deliveries right now.'}</p>
        </div>
      )}
      </div>
    </>
  )
}
