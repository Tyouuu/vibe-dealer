'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-full border border-ink-700 px-3 py-1.5 text-xs font-semibold text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper"
    >
      Log Out
    </button>
  )
}
