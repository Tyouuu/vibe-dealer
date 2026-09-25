'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dealerOtherMatch } from '@/lib/search'

// Jump to a dealer or a page without going through /dealers first.
//
// Built when the roster passed 551. At 34 dealers "search" meant opening
// /dealers and typing; at 551 finding one shop is the single most repeated
// action in the app, and it was three steps behind a page load.
//
// Mounted once by the layout and opened by an event, so the rail's search
// field and the mobile header's icon can both reach it without either owning
// the dialog or the two of them sharing React state across the shell.
export const OPEN_SEARCH_EVENT = 'vibe:open-search'

export type PaletteNavItem = { href: string; label: string; group: string }
type Dealer = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  region: string | null
  package: string | null
  status: string | null
}

type Hit =
  | { kind: 'dealer'; id: string; href: string; label: string; meta: string; warn: boolean }
  | { kind: 'page'; href: string; label: string; meta: string }

const MAX_DEALERS = 6
const MAX_PAGES = 5

/** Windows keyboards outnumber Macs here by all of them — the label has to match the key. */
function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K'
}

/**
 * Ranks a match by WHERE it matched, not just whether it did.
 *
 * "MZ Mobile Station" typed as "mz" has to beat "Ayer Tawar Cellular" typed
 * as "mz" would if the letters happened to appear mid-word somewhere. Start
 * of the name first, then start of any word, then anywhere.
 */
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase()
  const i = h.indexOf(needle)
  if (i === -1) return -1
  if (i === 0) return 0
  return /\s/.test(h[i - 1] ?? '') ? 1 : 2
}

export function CommandPalette({ navItems }: { navItems: PaletteNavItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [dealers, setDealers] = useState<Dealer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (dealers || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/search/dealers')
      const body = (await res.json()) as { dealers?: Dealer[] }
      setDealers(body.dealers ?? [])
    } catch {
      setDealers([])
    } finally {
      setLoading(false)
    }
  }, [dealers, loading])

  // Opening resets the query here rather than in an effect watching `open`.
  // An effect that calls setState the moment its dependency changes is a
  // second render triggered by the first, and the lint rule that flags it is
  // right: this is an event, so it belongs in the event.
  const openPalette = useCallback(() => {
    setQ('')
    setActive(0)
    setOpen(true)
    void load()
  }, [load])

  // Ctrl/⌘+K anywhere, and the event the two triggers fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((wasOpen) => {
          if (wasOpen) return false
          openPalette()
          return true
        })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, openPalette)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, openPalette)
    }
  }, [openPalette])

  useEffect(() => {
    if (!open) return
    // The input has to take focus after the dialog paints, or the first
    // character goes to whatever was focused behind it.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const hits: Hit[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages = navItems
      .map((n) => ({ n, s: score(n.label, needle) }))
      .filter((x) => needle === '' || x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, needle ? MAX_PAGES : MAX_PAGES)
      .map(({ n }): Hit => ({ kind: 'page', href: n.href, label: n.label, meta: n.group }))

    if (!needle) return pages

    const found = (dealers ?? [])
      .map((d) => {
        const other = dealerOtherMatch(d, needle)
        const byName = score(d.company_name, needle)
        const byRegion = score(d.region ?? '', needle) === 0 ? 1 : -1
        // A name hit ranks as it always did; a registration number, phone or contact
        // hit only counts when the name and region did not match, and ranks last.
        return { d, other, s: byName >= 0 ? Math.max(byName, byRegion) : Math.max(byRegion, other ? 2 : -1) }
      })
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.d.company_name.localeCompare(b.d.company_name))
      .slice(0, MAX_DEALERS)
      .map(({ d, other }): Hit => ({
        kind: 'dealer',
        id: d.id,
        href: `/dealers/${d.id}`,
        label: d.company_name,
        // The one thing worth knowing before you click, given 500 of them
        // cannot trade: whether this shop is set up at all.
        meta: [
          // Only when the name did not already explain the hit.
          other && score(d.company_name, needle) < 0 ? `${other.label}: ${other.value}` : null,
          d.region || 'No region',
          d.package ? `Package ${d.package}` : 'No package',
        ]
          .filter(Boolean)
          .join(' · '),
        // Not a warning: a dealer with no package on file trades at the standard rate like any other.
        warn: false,
      }))

    return [...found, ...pages]
  }, [q, dealers, navItems])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const go = (hit: Hit) => {
    setOpen(false)
    router.push(hit.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]) }
  }

  const firstPageIndex = hits.findIndex((h) => h.kind === 'page')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-paper/25 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search dealers and pages"
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-[0_1px_2px_rgba(20,39,61,.06),0_24px_60px_-20px_rgba(20,39,61,.45)]"
      >
        <div className="flex items-center gap-2.5 border-b border-ink-800 px-4">
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-paper-dim" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5 17 17" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search dealers and pages"
            aria-label="Search dealers and pages"
            className="w-full bg-transparent py-3.5 text-[14px] text-paper outline-none placeholder:text-paper-dim"
          />
          <kbd className="shrink-0 rounded border border-ink-800 px-1.5 py-0.5 text-[12px] font-medium text-paper-dim">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {q.trim() && loading && <p className="px-4 py-6 text-center text-[13px] text-paper-dim">Loading the roster…</p>}
          {q.trim() && !loading && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-paper-dim">
              Nothing matches “{q.trim()}”.
            </p>
          )}

          {hits.map((hit, i) => {
            const isFirstPage = i === firstPageIndex && hits.some((h) => h.kind === 'dealer')
            return (
              <div key={`${hit.kind}-${hit.href}`}>
                {i === 0 && hit.kind === 'dealer' && <Header>Dealers</Header>}
                {isFirstPage && <Header>Go to</Header>}
                {i === 0 && hit.kind === 'page' && !q.trim() && <Header>Go to</Header>}
                <button
                  type="button"
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={`flex w-full items-baseline gap-3 px-4 py-2 text-left transition-colors ${i === active ? 'bg-ink-850' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-paper">{hit.label}</span>
                  <span className={`shrink-0 text-[12px] ${hit.kind === 'dealer' && hit.warn ? 'text-brass-bright' : 'text-paper-dim'}`}>
                    {hit.meta}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-ink-800 px-4 py-2 text-[12px] text-paper-dim">
          <Hint keys="↑ ↓" label="move" />
          <Hint keys="↵" label="open" />
          <Hint keys={shortcutLabel()} label="toggle" />
          {dealers && <span className="ml-auto tabular-nums">{dealers.length} dealers</span>}
        </div>
      </div>
    </div>
  )
}

function Header({ children }: { children: React.ReactNode }) {
  // 12px, not 11 — design-audit enforces a floor and a group label inside a
  // dialog is no more exempt than a table caption is.
  return <p className="px-4 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[.07em] text-paper-dim">{children}</p>
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-ink-800 px-1.5 py-0.5 font-medium text-paper-dim">{keys}</kbd>
      {label}
    </span>
  )
}
