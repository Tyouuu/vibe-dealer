import { requireUser, type Role } from '@/lib/auth/dal'
import { LogoutButton } from './logout-button'
import { RealtimeRefresher } from './realtime-refresher'

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

const NAV_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['master'] },
  { href: '/dealers', label: 'Dealers', roles: ['master', 'accountant', 'cs'] },
  { href: '/onboard', label: 'Onboard Dealer', roles: ['cs'] },
  { href: '/entry', label: 'New Transaction', roles: ['accountant'] },
  { href: '/records', label: 'Transactions', roles: ['master', 'accountant'] },
  { href: '/delivery', label: 'SIM Delivery', roles: ['cs', 'master'] },
  { href: '/reports', label: 'Monthly Report', roles: ['master', 'accountant'] },
  { href: '/reconcile', label: 'Reconciliation', roles: ['master', 'accountant'] },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 px-7 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-extrabold text-white">
            D
          </div>
          <span className="text-sm font-bold text-zinc-50">DealerHub</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <RealtimeRefresher />
        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300">
          {ROLE_LABEL[user.role]}
        </span>
        <span className="text-xs text-zinc-500">{user.email}</span>
        <LogoutButton />
      </header>
      <main className="mx-auto w-full max-w-6xl px-7 py-8">{children}</main>
    </div>
  )
}
