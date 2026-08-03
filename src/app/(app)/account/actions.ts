'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'

export async function setNotificationsMasterEnabled(enabled: boolean) {
  await requireUser()
  const supabase = await createClient()

  // profiles' only UPDATE policy is master-only (0001/0008) — a direct
  // .update() here silently no-ops for accountant/cs (0 rows, no error).
  // This RPC (0017) is self-scoped via auth.uid(), not a broader self-update
  // policy, which would also let a user rewrite their own role column.
  await supabase.rpc('set_own_notifications_enabled', { p_enabled: enabled })

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
// This value is interpolated straight into the daily report's From header
// (`${senderName} <onboarding@resend.dev>`), so it has to survive being put in
// one. The form caps it at 80 characters, but that is a client-side attribute
// and the action accepted anything — including a pasted multi-line value,
// which would break the header for every master on the list, not just the one
// who typed it. Newlines and angle brackets out, length enforced here too.
const SENDER_NAME_MAX = 80

export async function updateReportSenderName(name: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const cleaned = name.replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SENDER_NAME_MAX)

  await supabase
    .from('profiles')
    .update({ report_sender_name: cleaned || null })
    .eq('id', user.id)

  revalidatePath('/account')
}

export async function signOutOtherSessions() {
  await requireUser()
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'others' })
  revalidatePath('/account')
}
