import { requireUser, type Role } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { buildNotifications } from '@/lib/notifications/build'
import { RailNav, type RailItem } from './rail-nav'
import { TopbarMenus, type Notification } from './topbar-menus'
import { MobileNav } from './mobile-nav'
import { NotificationToast } from './notification-toast'
import { LogoMark } from './icons'

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

const NAV_ITEMS: { href: string; label: string; roles: Role[]; group: string }[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'accountant', 'cs'], group: 'Overview' },
  { href: '/dealers', label: 'Dealers', roles: ['master', 'accountant', 'cs'], group: 'Dealers' },
  { href: '/onboard', label: 'Onboard Dealer', roles: ['cs', 'master'], group: 'Dealers' },
  { href: '/entry', label: 'New Transaction', roles: ['accountant', 'master'], group: 'Transactions' },
  { href: '/records', label: 'Transactions', roles: ['master', 'accountant'], group: 'Transactions' },
  { href: '/delivery', label: 'SIM Delivery', roles: ['cs', 'master'], group: 'Transactions' },
  { href: '/reports', label: 'Monthly Report', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/reconcile', label: 'Reconciliation', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/purchases', label: 'Credit Purchases', roles: ['master', 'accountant'], group: 'Finance' },
  { href: '/audit', label: 'Audit Log', roles: ['master'], group: 'Finance' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createClient()

  const isFinance = user.role === 'master' || user.role === 'accountant'

  const [{ count: dealerCount }, { count: pendingCount }, creditBalance, builtNotifications] = await Promise.all([
    supabase.from('dealers').select('id', { count: 'exact', head: true }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    getAvailablePointsBalance(supabase),
    buildNotifications(supabase, user.id, user.role),
  ])

  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))
  const railItems: RailItem[] = navItems.map((item) => ({
    href: item.href,
    label: item.label,
    group: item.group,
    badge: item.href === '/dealers' ? (dealerCount ?? undefined) : item.href === '/records' ? (pendingCount ?? undefined) : undefined,
  }))

  // The bell dropdown is a short preview (capped at 4) of the same list the
  // full /notifications page shows in full — see lib/notifications/build.ts
  // for the single source of truth both pull from.
  const notifications: Notification[] = builtNotifications.slice(0, 4).map((n) => ({ title: n.title, subtitle: n.subtitle }))

  return (
    // Floating "app shell" card on md+ (matches the design reference exactly:
    // 28px page margin, 1440px max-width, rounded 28px, bordered, shadowed) —
    // below md it collapses back to a plain edge-to-edge page, since the
    // reference never accounted for phone widths and a floating card with a
    // page margin would just waste screen space there.
    <div className="min-h-screen bg-ink-950 text-paper md:p-7">
      <NotificationToast notifications={builtNotifications.map((n) => ({ id: n.id, title: n.title, subtitle: n.subtitle, variant: n.variant }))} />
      <div className="flex min-h-screen flex-col md:mx-auto md:h-[calc(100vh-3.5rem)] md:max-w-[1440px] md:flex-row md:overflow-hidden md:rounded-[28px] md:border md:border-ink-800 md:bg-ink-900 md:shadow-[0_20px_60px_-30px_rgba(20,20,43,0.25)]">
        <div className="hidden md:block">
          <RailNav
            items={railItems}
            notifications={notifications}
            userName={user.name ?? user.email ?? 'User'}
            roleLabel={ROLE_LABEL[user.role]}
            role={user.role}
            actualRole={user.actualRole}
          />
        </div>

        <div className="flex min-h-screen flex-1 flex-col md:min-h-0">
          <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-900 px-4 py-3 md:hidden">
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="text-sm font-bold text-paper">DealerHub</span>
            <div className="flex-1" />
            <MobileNav
              items={navItems}
              roleLabel={ROLE_LABEL[user.role]}
              email={user.email}
              notifications={notifications}
              creditBalance={
                isFinance ? { available: creditBalance.available, low: creditBalance.available < LOW_BALANCE_THRESHOLD } : undefined
              }
            />
          </div>

          <header className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-ink-800 bg-ink-900/95 px-4 py-3 backdrop-blur sm:px-6 md:px-8">
            {isFinance && (
              <a
                href="/purchases"
                className="flex w-40 shrink-0 flex-col gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3.5 py-2.5 transition-colors hover:bg-ink-850"
                title="Credit balance — points bought from Vibe Mobile, not yet resold"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-paper-dim">Credit Balance</span>
                  <span className="text-sm font-extrabold tabular-nums text-paper">{creditBalance.available.toLocaleString()}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={`h-full rounded-full ${
                      creditBalance.available <= 0 ? 'bg-clay-bright' : creditBalance.available < LOW_BALANCE_THRESHOLD ? 'bg-brass-bright' : 'bg-jade-bright'
                    }`}
                    // "Full" is pinned at 3x the low-balance threshold (itself the
                    // biggest package's point cost) rather than some real ceiling —
                    // points has no natural max, it just goes up on the next
                    // purchase. This bar isn't "% of quota used" like a real usage
                    // meter, it's "how far from the danger zone", so 3x reads as a
                    // comfortable reserve without needing an actual cap to measure
                    // against.
                    style={{ width: `${Math.max(0, Math.min(100, (creditBalance.available / (LOW_BALANCE_THRESHOLD * 3)) * 100))}%` }}
                  />
                </div>
              </a>
            )}
            {/* Search/notifications/help/account live in the rail on md+; below
                md there's no rail, so this is the only place they can go. */}
            <div className="md:hidden">
              <TopbarMenus
                notifications={notifications}
                userName={user.name ?? user.email ?? 'User'}
                roleLabel={ROLE_LABEL[user.role]}
                role={user.role}
                actualRole={user.actualRole}
              />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-7 sm:py-8 md:overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
