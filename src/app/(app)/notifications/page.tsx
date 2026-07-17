import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { buildNotifications } from '@/lib/notifications/build'
import { NotificationsList } from './notifications-list'

export const metadata: Metadata = {
  title: 'Notifications — DealerHub',
}

export default async function NotificationsPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const notifications = await buildNotifications(supabase, user.id, user.role)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Notifications</h1>
        <a href="/account" className="text-xs font-semibold text-paper-dim hover:text-paper hover:underline">
          Manage what you get notified about →
        </a>
      </div>
      <NotificationsList notifications={notifications} />
    </div>
  )
}
