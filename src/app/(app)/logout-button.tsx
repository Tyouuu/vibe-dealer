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
      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
    >
      登出
    </button>
  )
}
