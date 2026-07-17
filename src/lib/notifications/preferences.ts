import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationCategory = 'pending_review' | 'deliveries' | 'credit_reconciliation' | 'dealer_activity'

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; description: string }[] = [
  { key: 'pending_review', label: 'Pending review', description: 'Transactions waiting on you' },
  { key: 'deliveries', label: 'Deliveries', description: 'SIM delivery queue' },
  { key: 'credit_reconciliation', label: 'Credit & reconciliation', description: 'Low balance, unreconciled statements' },
  { key: 'dealer_activity', label: 'Dealer activity', description: 'Inactive dealer alerts' },
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
