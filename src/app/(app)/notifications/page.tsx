import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { buildNotifications } from '@/lib/notifications/build'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'
import { NotificationsList } from './notifications-list'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'

export const metadata: Metadata = {
  title: 'Notifications — Vibe456',
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>
}) {
  const { category, sort } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  const notifications = await buildNotifications(supabase, user.id, user.role)
  // "Urgent" is the notification's own severity, not a second opinion — clay
  // is what build.ts assigns to the conditions that actually block work
  // (out of credit, a stalled delivery), brass to the ones worth knowing.
  const urgent = notifications.filter((n) => n.variant === 'clay').length
  const oldest = notifications.reduce((m, n) => Math.max(m, n.staleDays), 0)

  return (
    // Full content width, no cap. This is a list of single-line rows, not
    // running prose — line-length limits only bind on text that wraps, and
    // each row truncates. Every design system that addresses it says lists
    // should fill their container (Carbon: "On-page lists should span the
    // entire width of the container they are placed within to make the best
    // use of space"; Shopify says the same for resource index pages). The
    // right-aligned action button is what gives a wide row its far edge, so
    // the width reads as deliberate rather than empty.
    <div className="flex w-full flex-col gap-5">
      {/* The "manage" link was rendered twice — once as PageHeader's action
          and again as a sibling right next to it. Only the header one is
          needed. */}
      <PageHeader
        title="Notifications"
        subtitle="Everything the system has noticed that still needs someone to act on it."
        action={
          <a href="/account" className="btn-ghost shrink-0 py-1.5 text-xs">
            Manage
          </a>
        }
      />

      {/* A count in grey subtitle text isn't an answer. What the reader wants
          to know on arrival is whether anything is actually waiting and how
          long the worst of it has been sitting — the same reasoning as SIM
          Delivery, and the same reasoning that made Reconciliation work. */}
      <HeroCard
        label={notifications.length ? 'Needs your attention' : 'Nothing needs you'}
        value={String(notifications.length)}
        chgSuffix={
          notifications.length === 0
            ? 'everything the system checks is clear right now'
            : oldest > 0
              ? `oldest has been waiting ${oldest} day${oldest === 1 ? '' : 's'}`
              : 'all raised recently'
        }
        href="/notifications"
        // "Worth a look" was here, valued at notifications.length - urgent.
        // It held no information the other two did not: with the headline
        // above it, the card had two cells that added up to a third, in front
        // of a list short enough to count by eye.
        stats={[
          {
            label: 'Needs action now',
            value: String(urgent),
            href: '/notifications',
            tone: urgent ? 'warn' : 'normal',
            sub: 'flagged as blocking',
          },
          {
            label: 'Categories',
            value: String(new Set(notifications.map((n) => n.category)).size),
            href: '/account',
            sub: `of ${NOTIFICATION_CATEGORIES.length} the system checks`,
          },
        ]}
      />

      <NotificationsList
        notifications={notifications}
        initialFilter={NOTIFICATION_CATEGORIES.some((c) => c.key === category) ? (category as NotificationCategory) : 'all'}
        initialSort={sort === 'newest' ? 'newest' : 'oldest'}
      />
    </div>
  )
}
