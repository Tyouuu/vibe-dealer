'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'

export async function setNotificationsMasterEnabled(enabled: boolean) {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase.from('profiles').update({ notifications_enabled: enabled }).eq('id', user.id)

  revalidatePath('/account')
  revalidatePath('/', 'layout')
}

export async function setNotificationCategoryEnabled(category: NotificationCategory, enabled: boolean) {
  const user = await requireUser()
  if (!NOTIFICATION_CATEGORIES.some((c) => c.key === category)) return

  const supabase = await createClient()
  await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id, category, enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id,category' })

  revalidatePath('/account')
  revalidatePath('/', 'layout')
}

// Master-only in the UI (only masters currently receive the daily report
// email), but not re-checked here — an accountant/cs hitting this action
// directly would just set a column nothing reads for their own role, which
// is harmless, so it's not worth a second authorization check.
export async function updateReportSenderName(name: string) {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase
    .from('profiles')
    .update({ report_sender_name: name.trim() || null })
    .eq('id', user.id)

  revalidatePath('/account')
}

export async function signOutOtherSessions() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'others' })
  revalidatePath('/account')
}
