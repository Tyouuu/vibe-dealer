import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/dal'

export type NotificationCategory = 'pending_review' | 'deliveries' | 'credit_reconciliation' | 'dealer_activity'

// roles mirrors the exact gates notifications/build.ts uses to generate each
// category (isFinance/isOps/everyone) — kept alongside the label/description
// here, not duplicated, so the toggle shown to a role and the notifications
// that role can actually receive can't drift apart. Previously every role
// saw all 4 toggles regardless of relevance — a cs account had working-
// looking switches for "Pending review"/"Credit & reconciliation" that were
// permanent no-ops.
export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; description: string; roles: Role[] }[] = [
  { key: 'pending_review', label: 'Pending review', description: 'Transactions waiting on you', roles: ['master', 'accountant'] },
  { key: 'deliveries', label: 'Deliveries', description: 'SIM delivery queue', roles: ['master', 'cs'] },
  { key: 'credit_reconciliation', label: 'Credit & reconciliation', description: 'Low balance, unreconciled statements, a failed system check', roles: ['master', 'accountant'] },
  { key: 'dealer_activity', label: 'Dealer activity', description: 'Needs-follow-up alerts for quiet dealers', roles: ['master', 'accountant', 'cs'] },
]

export type NotificationPrefs = {
  masterEnabled: boolean
  categories: Record<NotificationCategory, boolean>
}

// Opt-out model: a missing row means "on", so existing users never silently
// lose a notification type they didn't explicitly turn off.
export async function getNotificationPrefs(supabase: SupabaseClient, userId: string): Promise<NotificationPrefs> {
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('notifications_enabled').eq('id', userId).single(),
    supabase.from('notification_preferences').select('category, enabled').eq('user_id', userId),
  ])

  const categories = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, true])) as Record<NotificationCategory, boolean>
  for (const row of rows ?? []) {
    categories[row.category as NotificationCategory] = row.enabled
  }

  return {
    masterEnabled: profile?.notifications_enabled ?? true,
    categories,
  }
}
