'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type NavItem = { href: string; label: string }
type DealerItem = { id: string; company_name: string }
type Result = { type: 'page' | 'dealer'; href: string; label: string }

// The one thing a legacy DMS and a marketing screenshot both fail to give
// you: real keyboard-first navigation. Cmd/Ctrl+K jumps straight to a page
// or a dealer by name, no menu-diving required.
export function CommandPalette({ navItems, dealers }: { navItems: NavItem[]; dealers: DealerItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Reset query/activeIndex when the palette opens. Adjusted during render
  // (React's supported pattern for "reset state when a prop changes") rather
  // than in an effect, so it doesn't trigger an extra commit-then-rerender pass.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const pages = navItems
      .filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n): Result => ({ type: 'page', href: n.href, label: n.label }))
    if (!q) return pages
    const dealerResults = dealers
      .filter((d) => d.company_name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((d): Result => ({ type: 'dealer', href: `/dealers/${d.id}`, label: d.company_name }))
    return [...pages, ...dealerResults]
  }, [query, navItems, dealers])

  const [prevResultsLength, setPrevResultsLength] = useState(results.length)
  if (results.length !== prevResultsLength) {
    setPrevResultsLength(results.length)
    setActiveIndex(0)
  }

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper-dim transition-colors hover:bg-ink-850"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M16 16l-3.2-3.2" />
        </svg>
        Search
        <span className="rounded border border-ink-700 bg-ink-850 px-1 py-0.5 font-mono text-[10px] text-paper-dim">⌘K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-paper/40 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1))
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex((i) => Math.max(i - 1, 0))
                }
                if (e.key === 'Enter' && results[activeIndex]) {
                  go(results[activeIndex].href)
                }
              }}
              placeholder="Jump to a page, or search dealers by name…"
              className="w-full border-b border-ink-800 bg-transparent px-4 py-3.5 text-sm text-paper outline-none placeholder:text-paper-dim/60"
            />
            <div className="max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-paper-dim">No matches.</div>}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.href}`}
                  type="button"
                  onClick={() => go(r.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === activeIndex ? 'bg-jade/10 text-jade-bright' : 'text-paper hover:bg-ink-850'
                  }`}
                >
                  <span className={`timeline-dot ${r.type === 'dealer' ? 'timeline-dot-slate' : 'timeline-dot-jade'}`} />
                  {r.label}
                  {r.type === 'dealer' && (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-paper-dim">Dealer</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2 text-[11px] text-paper-dim">
              <span>↑↓ to navigate · Enter to select</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
