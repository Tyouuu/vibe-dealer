import { requireUser, type Role } from '@/lib/auth/dal'
import { LogoutButton } from './logout-button'
import { RealtimeRefresher } from './realtime-refresher'
import { NavLinks } from './nav-links'
import { LogoMark } from './icons'

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

const NAV_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['master'] },
  { href: '/dealers', label: 'Dealers', roles: ['master', 'accountant', 'cs'] },
  { href: '/onboard', label: 'Onboard Dealer', roles: ['cs', 'master'] },
  { href: '/entry', label: 'New Transaction', roles: ['accountant', 'master'] },
  { href: '/records', label: 'Transactions', roles: ['master', 'accountant'] },
  { href: '/delivery', label: 'SIM Delivery', roles: ['cs', 'master'] },
  { href: '/reports', label: 'Monthly Report', roles: ['master', 'accountant'] },
  { href: '/reconcile', label: 'Reconciliation', roles: ['master', 'accountant'] },
  { href: '/audit', label: 'Audit Log', roles: ['master'] },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <div className="min-h-screen bg-ink-950 text-paper">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="flex items-center gap-4 px-7 py-3.5">
          <div className="flex items-center gap-2.5">
            <span style={{ filter: 'drop-shadow(0 4px 10px rgba(20, 122, 78, 0.3))' }}>
              <LogoMark className="h-8 w-8" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-paper">DealerHub</div>
              <div className="text-[10px] font-medium tracking-wide text-paper-dim">Vibe Mobile · Master Ledger</div>
            </div>
          </div>
          <NavLinks items={navItems} />
          <div className="flex-1" />
          <RealtimeRefresher />
          <span className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs font-semibold text-paper-dim">
            {ROLE_LABEL[user.role]}
          </span>
          <span className="hidden text-xs text-paper-dim sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
        <div className="h-px bg-gradient-to-r from-jade/50 via-ink-800 to-transparent" />
      </header>
      <main className="mx-auto w-full max-w-6xl px-7 py-8">{children}</main>
    </div>
  )
}
