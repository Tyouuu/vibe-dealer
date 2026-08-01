import { Suspense } from 'react'
import Link from 'next/link'
import { requireUser, type Role } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { getNotifications } from '@/lib/notifications/build'
import { RailNav, type RailItem } from './rail-nav'
import { ROLE_LABEL, type Notification } from './types'
import { MobileNav } from './mobile-nav'
import { NotificationToast } from './notification-toast'
import { LogoMark } from './icons'
import { RestoreScroll } from './restore-scroll'

const NAV_ITEMS: { href: string; label: string; roles: Role[]; group: string }[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'accountant', 'cs'], group: 'Overview' },
  { href: '/dealers', label: 'Dealers', roles: ['master', 'accountant', 'cs'], group: 'Dealers' },
  { href: '/onboard', label: 'Onboard Dealer', roles: ['cs', 'master'], group: 'Dealers' },
  { href: '/entry', label: 'New Transaction', roles: ['accountant', 'master'], group: 'Transactions' },
  { href: '/records', label: 'Transactions', roles: ['master', 'accountant'], group: 'Transactions' },
  { href: '/delivery', label: 'SIM Delivery', roles: ['cs', 'master'], group: 'Transactions' },
  { href: '/sim-stock', label: 'SIM Card Stock', roles: ['cs', 'accountant', 'master'], group: 'Transactions' },
  { href: '/reports', label: 'Monthly Report', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/reconcile', label: 'Reconciliation', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/purchases', label: 'Credit Purchases', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/audit', label: 'Audit Log', roles: ['master'], group: 'Finance' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createClient()

  const isFinance = user.role === 'master' || user.role === 'accountant'

  // No dealer count here any more — the /dealers badge that consumed it is
  // gone (see the badge note below), and this was a COUNT over 249 rows on
  // every single page load in the app, for a number nothing rendered.
  const [{ count: pendingCount }, { count: pendingDeliveryCount }, creditBalance, builtNotifications] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('delivery_queue').select('id', { count: 'exact', head: true }).eq('delivery_status', 'pending'),
    getAvailablePointsBalance(supabase),
    getNotifications(user.id, user.role),
  ])

  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))
  const railItems: RailItem[] = navItems.map((item) => ({
    href: item.href,
    label: item.label,
    group: item.group,
    // A badge means "this needs you", never "this is how many exist". The
    // /dealers badge showed 249 — a number that barely moves, permanently lit,
    // and visually louder than the two genuine alerts beside it. Stripe badges
    // unresolved disputes; Linear badges unread. Neither badges a total.
    badge:
      item.href === '/records'
        ? (pendingCount ?? undefined)
        : item.href === '/delivery'
          ? (pendingDeliveryCount ?? undefined)
          : undefined,
  }))

  // The bell dropdown is a short preview (capped at 4) of the same list the
  // full /notifications page shows in full — see lib/notifications/build.ts
  // for the single source of truth both pull from.
  const notifications: Notification[] = builtNotifications.slice(0, 4).map((n) => ({ title: n.title, subtitle: n.subtitle }))

  // The canvas is the tinted surface; cards are the white ones that sit on it.
  // This was bg-ink-900 — pure white — laid over a body that was already
  // tinted, so every card was white-on-white and the only thing separating one
  // from the page was a 1px hairline. That is why the app read as a wireframe
  // no matter how the blocks were arranged: nothing had elevation, so nothing
  // had weight.
  return (
    <div className="min-h-screen bg-canvas text-paper">
      <NotificationToast notifications={builtNotifications.map((n) => ({ id: n.id, title: n.title, subtitle: n.subtitle, variant: n.variant }))} />
      {/* The rail appears at lg (1024px), not md (768px). At 768-1023 — an
          iPad in portrait, the single most common tablet size — a permanent
          248px rail ate 30% of the screen and left only ~474px for content,
          which is phone-width, so every table was scrolling sideways on a
          device with plenty of room. No major design system treats 768px as
          where desktop layouts start: Tailwind's own lg, Microsoft Fluent's
          x-large, USWDS's `desktop`, and Atlassian's 12-column grid all
          begin at 1024, and Carbon's 16-column grid at 1056. Below lg the
          rail collapses into the existing hamburger panel and the content
          gets the full width. */}
      <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
        <div className="hidden lg:block">
          <RailNav
            items={railItems}
            notifications={notifications}
            userName={user.name ?? user.email ?? 'User'}
            roleLabel={ROLE_LABEL[user.role]}
            role={user.role}
            actualRole={user.actualRole}
            creditBalance={
              isFinance
                ? {
                    available: creditBalance.available,
                    low: creditBalance.available < LOW_BALANCE_THRESHOLD,
                    empty: creditBalance.available <= 0,
                  }
                : undefined
            }
          />
        </div>

        {/* lg:pl-[248px] reserves the space the now position:fixed .rail no
            longer occupies in normal flow (it used to be sticky, still
            flex-flow-participating) — without this the content would start
            at x:0, hidden under the rail.

            min-w-0 is load-bearing: as a row-direction flex item this
            defaults to min-width:auto, which refuses to shrink below its
            content's min-content width. Any page with a wide table then
            pushed this column past the viewport (e.g. 1326px inside an
            820px tablet) and the parent's lg:overflow-hidden CLIPPED the
            excess — content silently cut off, with no scrollbar to reach
            it, because the clip meant the document itself never reported
            an overflow. Letting this shrink is what pushes the horizontal
            scrolling back down into each table's own ScrollFade, where it
            belongs. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:min-h-0 lg:pl-[248px]">
          <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-900 px-4 py-3 lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-3">
              <LogoMark className="h-8 w-8 shrink-0" />
              <span className="text-sm font-semibold text-paper">DealerHub</span>
            </Link>
            <div className="flex-1" />
            <MobileNav
              items={navItems}
              roleLabel={ROLE_LABEL[user.role]}
              email={user.email}
              notifications={notifications}
              role={user.role}
              actualRole={user.actualRole}
              creditBalance={
                isFinance ? { available: creditBalance.available, low: creditBalance.available < LOW_BALANCE_THRESHOLD } : undefined
              }
            />
          </div>

          {/* No desktop header bar at all. It only ever held the credit
              balance, and a full-width strip for one small chip in the far
              corner reads as an empty plank however it is coloured. The
              balance now lives with the brand mark at the top of the rail;
              every page gains the full viewport height back. */}

          {/* The vertical padding lives on the inner wrapper, not here, and
              that placement is load-bearing. <main> is the scroll container
              on lg (lg:overflow-y-auto inside the lg:overflow-hidden shell),
              and a sticky offset resolves against the scrollport's *content*
              box — inside its padding. With py-8 on <main>, every `sticky
              top-0` table header pinned 32px below the visible top of the
              scroller, leaving a 32px strip that rows scrolled through above
              the header. It read as the header drifting while scrolling.
              Horizontal padding stays here so the scrollbar sits at the far
              right edge rather than inset from it. */}
          <main className="flex-1 px-4 sm:px-7 lg:overflow-y-auto">
            {/* No max-width here — the shell above already caps out at 1440px
                total (md:max-w-[1440px]), so this only needs w-full to use
                whatever room that leaves past the rail. A redundant narrower
                cap here (max-w-6xl = 1152px) was leaving visible dead space
                on wide-grid pages like Credit Purchases/Reconcile/Dealers.
                Pages that genuinely want a narrower reading column (Account
                Settings, Notifications) already set their own max-width on
                their own root element, so this doesn't affect those. */}
            <Suspense fallback={null}>
              <RestoreScroll />
            </Suspense>
            <div className="mx-auto w-full py-6 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
