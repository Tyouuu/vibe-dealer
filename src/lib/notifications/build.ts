import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/auth/dal'
import { getDealerActivityMap, daysSince, PENDING_REVIEW_STALE_DAYS, DELIVERY_WARN_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'
import { getNotificationPrefs, type NotificationCategory } from './preferences'

export type BuiltNotification = {
  id: string
  category: NotificationCategory
  variant: 'brass' | 'clay' | 'info' | 'slate'
  title: string
  subtitle: string
  href: string
  actionLabel: string
  // How many days this has been sitting unresolved — the closest thing to a
  // "date" these have, since notifications are recomputed live rather than
  // stored with a real created-at. Used to sort Oldest/Newest. 0 for
  // conditions that don't age (e.g. balance is either low or it isn't).
  staleDays: number
}

// The single source of truth for "what needs this user's attention" — used
// both for the sidebar bell preview and the full /notifications page, so the
// two never drift out of sync. Every condition here mirrors what the
// dashboard's own KPI cards already surface, just reshaped into a flat list
// and gated by the signed-in user's own category/master preferences.
export async function buildNotifications(supabase: SupabaseClient, userId: string, role: Role): Promise<BuiltNotification[]> {
  const isFinance = role === 'master' || role === 'accountant'
  const isOps = role === 'cs' || role === 'master'
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`

  const [prefs, { data: dealerRows }, { data: pendingRows }, { data: statement }, activityMap, creditBalance, { data: pendingDeliveryRows }] =
    await Promise.all([
      getNotificationPrefs(supabase, userId),
      supabase.from('dealers_directory').select('id, company_name'),
      isFinance ? supabase.from('transactions').select('id, tx_date').eq('status', 'pending') : Promise.resolve({ data: null }),
      isFinance
        ? supabase.from('company_statements').select('reconciled').eq('month', monthStart).maybeSingle()
        : Promise.resolve({ data: null }),
      getDealerActivityMap(supabase),
      isFinance ? getAvailablePointsBalance(supabase) : Promise.resolve(null),
      isOps ? supabase.from('delivery_queue').select('id, tx_date').eq('delivery_status', 'pending') : Promise.resolve({ data: null }),
    ])

  const list: BuiltNotification[] = []
  if (!prefs.masterEnabled) return list

  if (isFinance && prefs.categories.pending_review && pendingRows?.length) {
    const oldest = Math.max(...pendingRows.map((t) => daysSince(t.tx_date)))
    list.push({
      id: 'pending_review',
      category: 'pending_review',
      variant: 'brass',
      title: `${pendingRows.length} transaction${pendingRows.length === 1 ? '' : 's'} pending review`,
      subtitle: oldest >= PENDING_REVIEW_STALE_DAYS ? `Oldest is ${oldest}d old` : 'All recently recorded',
      href: '/records?status=pending',
      actionLabel: 'Review transactions',
      staleDays: oldest,
    })
  }

  if (prefs.categories.dealer_activity) {
    const inactive = [...activityMap.entries()]
      .filter(([, a]) => a.isInactive)
      .sort((a, b) => b[1].daysSinceLastActivity - a[1].daysSinceLastActivity)
    for (const [dealerId, a] of inactive) {
      const dealerName = dealerRows?.find((d) => d.id === dealerId)?.company_name ?? 'A dealer'
      list.push({
        id: `dealer_activity:${dealerId}`,
        category: 'dealer_activity',
        variant: 'slate',
        title: `${dealerName} needs a follow-up`,
        subtitle: `No verified top-up in ${a.daysSinceLastActivity} days`,
        href: `/dealers/${dealerId}`,
        actionLabel: 'View dealer',
        staleDays: a.daysSinceLastActivity,
      })
    }
  }

  if (isFinance && prefs.categories.credit_reconciliation && !statement?.reconciled) {
    list.push({
      id: 'credit_reconciliation:statement',
      category: 'credit_reconciliation',
      variant: 'clay',
      title: `${today.slice(0, 7)} statement not reconciled`,
      subtitle: 'Enter the Vibe statement and mark it reconciled',
      href: '/reconcile',
      actionLabel: 'Go to Reconciliation',
      staleDays: daysSince(monthStart),
    })
  }

  if (isFinance && prefs.categories.credit_reconciliation && creditBalance && creditBalance.available < LOW_BALANCE_THRESHOLD) {
    list.push({
      id: 'credit_reconciliation:balance',
      category: 'credit_reconciliation',
      variant: 'clay',
      title: creditBalance.available <= 0 ? 'Out of credit — buy from Vibe Mobile' : 'Credit balance running low',
      subtitle: `${creditBalance.available.toLocaleString()} pts left — log a Credit Purchase before it blocks a sale`,
      href: '/purchases',
      actionLabel: 'Log Credit Purchase',
      staleDays: 0,
    })
  }

  if (isOps && prefs.categories.deliveries && pendingDeliveryRows?.length) {
    const oldest = Math.max(...pendingDeliveryRows.map((r) => daysSince(r.tx_date)))
    list.push({
      id: 'deliveries',
      category: 'deliveries',
      variant: 'info',
      title: `${pendingDeliveryRows.length} SIM ${pendingDeliveryRows.length === 1 ? 'delivery' : 'deliveries'} pending`,
      subtitle: oldest >= DELIVERY_WARN_DAYS_THRESHOLD ? `Oldest is ${oldest}d old` : 'All recently queued',
      href: '/delivery',
      actionLabel: 'View delivery queue',
      staleDays: oldest,
    })
  }

  return list
}

// The app shell renders the notification bell on every page, and the dashboard
// now shows the same list in its "Needs attention" card. Both need the same
// answer within one request, and buildNotifications costs ~7 queries — so this
// is the entry point both should use. React's cache() dedupes per request,
// keyed on (userId, role) rather than on a Supabase client instance, because
// createClient() returns a fresh object each call and would never hit.
// Same pattern as getCurrentUser in lib/auth/dal.ts.
export const getNotifications = cache(async (userId: string, role: Role): Promise<BuiltNotification[]> => {
  const supabase = await createClient()
  return buildNotifications(supabase, userId, role)
})
