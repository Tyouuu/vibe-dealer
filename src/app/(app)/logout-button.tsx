'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconLogout } from './icons'

export function LogoutButton({ variant = 'default' }: { variant?: 'default' | 'rail' }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (variant === 'rail') {
    return (
      <button onClick={handleLogout} className="rail-item logout" type="button">
        <IconLogout className="h-[18px] w-[18px]" />
        <span className="lbl">Log out</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleLogout}
      type="button"
      className="rounded-lg border border-ink-800 px-3 py-1.5 text-xs font-semibold text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper"
    >
      Log Out
    </button>
  )
}
