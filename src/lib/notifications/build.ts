import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
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
      supabase.from('dealers').select('id, company_name'),
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
        title: `${dealerName} is inactive`,
        subtitle: `No activity in ${a.daysSinceLastActivity} days`,
        href: `/dealers/${dealerId}`,
        actionLabel: 'View dealer',
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
    })
  }

  return list
}
