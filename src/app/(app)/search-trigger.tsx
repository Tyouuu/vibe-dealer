'use client'

import { useSyncExternalStore } from 'react'
import { OPEN_SEARCH_EVENT } from './command-palette'

// The visible half of the palette.
//
// A shortcut nobody can see is a shortcut nobody uses — which is the one
// thing worth taking from shadcn-admin's shell: the field sits in the chrome
// with the key printed inside it, so the shortcut is learned by reading
// rather than by being told.
function open() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}

// The server has no navigator, and correcting the label in an effect is a
// second render triggered by the first. useSyncExternalStore takes both
// snapshots up front: 'Ctrl K' on the server, the real one on the client, and
// React reconciles them without a cascading render. Nothing ever changes it
// afterwards, so the subscribe function has nothing to subscribe to.
const noop = () => () => {}
const clientLabel = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K')
const serverLabel = () => 'Ctrl K'

function useShortcutLabel() {
  return useSyncExternalStore(noop, clientLabel, serverLabel)
}

function SearchGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <path d="M13.5 13.5 17 17" strokeLinecap="round" />
    </svg>
  )
}

/** The rail's field. Looks like an input, is a button — nothing is typed here. */
export function SearchField() {
  const label = useShortcutLabel()
  return (
    <button type="button" onClick={open} className="rail-search" aria-label="Search dealers and pages">
      <SearchGlyph className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Search</span>
      <kbd className="ml-auto shrink-0 rounded border border-ink-800 px-1.5 py-px text-[12px] font-medium tabular-nums">{label}</kbd>
    </button>
  )
}

/** The phone header's icon. Same dialog, no room for a field. */
export function SearchIconButton() {
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search dealers and pages"
      className="grid h-9 w-9 place-items-center rounded-lg text-paper-dim hover:bg-ink-850 hover:text-paper"
    >
      <SearchGlyph className="h-4 w-4" />
    </button>
  )
}
