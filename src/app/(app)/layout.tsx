import { requireUser } from '@/lib/auth/dal'
import { LogoutButton } from './logout-button'

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

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
          <a
            href="/dealers"
            className="rounded-lg px-3 py-1.5 font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
          >
            Dealer 名单
          </a>
        </nav>
        <div className="flex-1" />
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
