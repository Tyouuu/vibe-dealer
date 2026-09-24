import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, DELIVERY_STALLED_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { IconTruck } from '../icons'
import { DeliveryTable } from './delivery-table'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'

export const metadata: Metadata = {
  title: 'SIM Delivery — Vibe456',
}

type RawDeliveryRow = {
  id: string
  company_name: string
  address: string | null
  tx_date: string
  type: 'package' | 'topup' | 'sim_order'
  package: string | null
  sim_type: 'physical' | 'physical_no_number' | 'esim' | null
  source: 'sale' | 'order'
  quantity: number | null
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
}

type PageProps = {
  searchParams: Promise<{ all?: string; error?: string }>
}

export default async function DeliveryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { all, error } = await searchParams
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
    .select('id, company_name, address, tx_date, type, package, sim_type, delivery_status, status, source, quantity')
    .neq('status', 'flagged')
    // A queue is worked oldest-first: the card that has waited longest is the one
    // the Waiting column exists to surface, and newest-first buried it at the
    // bottom. The all-transactions tab is history, so it stays newest-first.
    .order('tx_date', { ascending: showAll ? false : true })

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
      {/* The page's real answer used to sit in grey subtitle text: the oldest
          item had been waiting 56 days. This is a work queue, so what it owes
          the reader is "how much is waiting and how bad is the worst of it" —
          not a count in small print above a table.

          The unit explanation moved into the subtitle, where it earns its
          place instead of sitting as a permanent banner between the controls
          and the rows it describes. */}
      <PageHeader
        title="SIM Delivery"
        subtitle="Physical SIMs — from a package sale or a SIM card order — ship to the office and then on to the dealer. eSIM package sales activate instantly and only appear here under Show all, marked Instant."
      />

      {error && <div className="alert alert-bad">{error}</div>}

      <HeroCard
        label={showAll ? 'Deliveries pending' : 'Waiting to be sent'}
        value={String(pendingRows.length)}
        chgSuffix={
          pendingRows.length === 0
            ? 'nothing waiting on you'
            : oldestDays >= DELIVERY_STALLED_DAYS_THRESHOLD
              ? `oldest has waited ${oldestDays} days — well past the ${DELIVERY_STALLED_DAYS_THRESHOLD}-day mark`
              : `oldest has waited ${oldestDays} day${oldestDays === 1 ? '' : 's'}`
        }
        href="/delivery"
        // "Showing N items / pending only" used to sit here as a third stat.
        // The segmented control directly below already says which set is on
        // screen, and the rows themselves are under that — three ways of
        // saying the same thing within 200px, at any amount of data.
        stats={[
          {
            label: 'Overdue',
            value: String(pendingRows.filter((r) => r.days >= DELIVERY_STALLED_DAYS_THRESHOLD).length),
            href: '/delivery',
            tone: pendingRows.some((r) => r.days >= DELIVERY_STALLED_DAYS_THRESHOLD) ? 'warn' : 'normal',
            sub: `${DELIVERY_STALLED_DAYS_THRESHOLD}+ days waiting`,
          },
          {
            label: 'Queued today',
            value: String(pendingRows.filter((r) => r.days < DELIVERY_WARN_DAYS_THRESHOLD).length),
            href: '/delivery',
            sub: 'not late yet',
          },
        ]}
      />

      {/* The queue is the page — no card. See .index-surface. */}
      <div className="index-surface">
      {/* Polaris puts filtering at the top of the index itself rather than in
          the page header — these are controls over the list below, not
          actions on the page. The switcher moves to the left, where the
          other two index pages put theirs; right-aligned it was the only
          control on the page and read as an afterthought. */}
      <div className="index-filterbar">
        <div className="segmented">
          <Link href="/delivery" className={`segmented-btn ${!showAll ? 'active' : ''}`}>
            Show pending only
          </Link>
          <Link href="/delivery?all=1" className={`segmented-btn ${showAll ? 'active' : ''}`}>
            Show all
          </Link>
        </div>
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
