import { requireUser, type Role } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'
import { RealtimeRefresher } from './realtime-refresher'
import { NavLinks } from './nav-links'
import { LogoMark } from './icons'
import { CommandPalette } from './command-palette'
import { MobileNav } from './mobile-nav'

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

  const supabase = await createClient()
  const { data: dealerRows } = await supabase.from('dealers').select('id, company_name').order('company_name')

  return (
    <div className="min-h-screen bg-ink-950 text-paper">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-7">
          <div className="flex items-center gap-2.5">
            <span style={{ filter: 'drop-shadow(0 4px 10px rgba(20, 122, 78, 0.3))' }}>
              <LogoMark className="h-8 w-8" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-paper">DealerHub</div>
              <div className="hidden text-[10px] font-medium tracking-wide text-paper-dim sm:block">Vibe Mobile · Master Ledger</div>
            </div>
          </div>
          <div className="hidden md:block">
            <NavLinks items={navItems} />
          </div>
          <div className="flex-1" />
          <div className="hidden md:block">
            <CommandPalette navItems={navItems} dealers={dealerRows ?? []} />
          </div>
          <div className="hidden md:block">
            <RealtimeRefresher />
          </div>
          <span className="hidden rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs font-semibold text-paper-dim md:inline-flex">
            {ROLE_LABEL[user.role]}
          </span>
          <span className="hidden text-xs text-paper-dim lg:inline">{user.email}</span>
          <div className="hidden md:block">
            <LogoutButton />
          </div>
          <MobileNav items={navItems} roleLabel={ROLE_LABEL[user.role]} email={user.email} />
        </div>
        <div className="h-px bg-gradient-to-r from-jade/50 via-ink-800 to-transparent" />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 sm:py-8">{children}</main>
    </div>
  )
}
