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
    // Left-aligned, not mx-auto — see the note in onboard-form.tsx: the rest
    // of the app starts at the left edge of the content area, so centring
    // this made it look boxed-in beside the sidebar.
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-[26px] font-extrabold tracking-tight text-paper">
          Notifications
          <span className="pill pill-neutral">
            {notifications.length} notification{notifications.length === 1 ? '' : 's'}
          </span>
        </h1>
        {/* inline-block + py-1.5 so this standalone link is a 24px-tall touch
            target (WCAG 2.5.8) rather than just its 16px line box. */}
        <a href="/account" className="inline-block py-1.5 text-xs font-semibold text-paper-dim hover:text-paper hover:underline">
          Manage what you get notified about →
        </a>
      </div>
      <NotificationsList notifications={notifications} />
    </div>
  )
}
