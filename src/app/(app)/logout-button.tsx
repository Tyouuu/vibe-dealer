'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { REMEMBER_COOKIE } from '@/lib/idle'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Forget the device too. Otherwise signing out and letting a colleague
    // sign in hands them a session with no idle timeout that they never asked
    // for. Readable by script by design — this one is not httpOnly-critical,
    // and the middleware treats its absence as the safe answer.
    document.cookie = `${REMEMBER_COOKIE}=;path=/;max-age=0;samesite=lax`
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      type="button"
      className="rounded-lg border border-ink-800 px-3 py-1.5 text-xs font-semibold text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper"
    >
      Log out
    </button>
  )
}
