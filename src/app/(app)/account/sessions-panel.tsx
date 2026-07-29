'use client'

import { signOutOtherSessions } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { LogoutButton } from '../logout-button'

export type SignInEvent = { id: string; device: string; when: string }

export function SessionsPanel({ currentDevice, since, history }: { currentDevice: string; since: string | null; history: SignInEvent[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3 rounded-lg border border-ink-800 bg-ink-850 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-paper">Most recent sign-in</div>
          <div className="text-[12px] text-paper-dim">
            {currentDevice}
            {since ? ` · since ${since}` : ''}
          </div>
        </div>
        {/* Neither action here is destructive (no data is lost either way),
            so both share the same neutral btn-ghost — a solid clay/red
            button next to a plain "Log Out" made this row look like it was
            warning about two different things when it's really just two
            ordinary session actions. */}
        <div className="flex shrink-0 items-center gap-2">
          <form action={signOutOtherSessions}>
            <ConfirmSubmitButton
              className="btn-ghost"
              confirmMessage="Sign out of every other session? Any other device currently signed in will be logged out."
            >
              Sign out of all other sessions
            </ConfirmSubmitButton>
          </form>
          <LogoutButton />
        </div>
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
