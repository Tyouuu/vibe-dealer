'use client'

import { useTransition } from 'react'
import { signOutOtherSessions } from './actions'

export type SignInEvent = { id: string; device: string; when: string }

export function SessionsPanel({ currentDevice, since, history }: { currentDevice: string; since: string | null; history: SignInEvent[] }) {
  const [pending, startTransition] = useTransition()

  function handleSignOutOthers() {
    if (!confirm('Sign out of every other session? Any other device currently signed in will be logged out.')) return
    startTransition(() => {
      signOutOtherSessions()
    })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-850 px-3.5 py-2.5">
        <div>
          <div className="text-sm font-bold text-paper">Most recent sign-in</div>
          <div className="text-[12px] text-paper-dim">
            {currentDevice}
            {since ? ` · since ${since}` : ''}
          </div>
        </div>
        <button onClick={handleSignOutOthers} disabled={pending} className="text-xs font-bold text-clay-bright hover:underline disabled:opacity-50">
          {pending ? 'Signing out…' : 'Sign out of all other sessions'}
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <span className="field-label">Sign-in history</span>
          <div className="flex flex-col divide-y divide-ink-800 rounded-lg border border-ink-800">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]">
                <span className="font-semibold text-paper">{h.device}</span>
                <span className="text-paper-dim">{h.when}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
