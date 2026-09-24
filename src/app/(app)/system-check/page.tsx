import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { todayInMalaysia } from '@/lib/month'
import { PermissionDenied } from '../permission-denied'
import { PageHeader } from '../page-header'
import { verdictOf, type CheckResult, type CheckStatus } from '@/lib/system-check'
import { cleanStreak, dailyStates, malaysiaDate, type DayState, type RunSummary } from '@/lib/system-check-history'
import { CheckNowButton } from './check-now-button'

export const metadata: Metadata = {
  title: 'System Check — Vibe456',
}

// The page's one question: can I trust the numbers?
//
// So the answer is the biggest thing on it, in a sentence, and everything else is the evidence for that
// sentence. What is wrong comes first and in full — each broken rule with the entries that broke it —
// and what passed is folded away, because a page that leads with fifteen green ticks buries the one red
// one and teaches you to stop reading.

type PageProps = { searchParams: Promise<{ error?: string }> }

type StoredRun = {
  id: string
  ran_at: string
  source: 'nightly' | 'manual'
  results: CheckResult[]
  fail_count: number
  warn_count: number
}

const DOT: Record<CheckStatus, 'jade-bright' | 'brass-bright' | 'clay-bright' | 'slate-bright'> = {
  ok: 'jade-bright',
  warn: 'brass-bright',
  fail: 'clay-bright',
  info: 'slate-bright',
}

const DAY_COLOUR: Record<DayState, string> = {
  clear: 'var(--color-jade)',
  look: 'var(--color-brass)',
  problem: 'var(--color-clay)',
  none: 'var(--color-ink-800)',
}

const DAY_WORDS: Record<DayState, string> = {
  clear: 'every rule held',
  look: 'nothing broken, something worth a look',
  problem: 'a rule was broken',
  none: 'not checked',
}

function when(iso: string, today: string): string {
  const time = new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
  if (malaysiaDate(iso) === today) return `today at ${time}`
  const day = new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short' })
  return `${day} at ${time}`
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`

export default async function SystemCheckPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="see the system check" />
  }

  const supabase = await createClient()
  const today = todayInMalaysia()
  // From `today` rather than the clock, so the page and its strip agree on which day it is.
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 45 * 86_400_000).toISOString()

  const [{ data: latestRow }, { data: history }] = await Promise.all([
    supabase
      .from('system_check_runs')
      .select('id, ran_at, source, results, fail_count, warn_count')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A run a day plus the odd manual one is a few dozen rows in 45 days; the cap is a backstop.
    supabase.from('system_check_runs').select('ran_at, fail_count, warn_count').gte('ran_at', since).order('ran_at', { ascending: false }).limit(500),
  ])
  const latest = latestRow as StoredRun | null

  return (
    <>
      <PageHeader
        title="System Check"
        subtitle="The books, tested against their own rules every morning — and whenever you press the button."
        action={<CheckNowButton />}
      />

      {error && <div className="alert alert-bad">{error}</div>}

      {!latest ? (
        // A card, not the dashed empty state: this is the state the page is in on its first day, and a page whose
        // only content is a dashed outline has nothing on it to anchor the eye. The button that fixes it is in
        // the header, so the card says what it does and where it is.
        <div className="app-card mt-8">
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-.02em] text-paper">No check has run yet</h2>
          <p className="mt-1.5 max-w-2xl text-[13px] text-paper-dim">
            The first one runs by itself at 9 the next morning, and every morning after. Press Check now to see where the books stand today.
          </p>
        </div>
      ) : (
        <Report run={latest} history={(history ?? []) as RunSummary[]} today={today} />
      )}
    </>
  )
}

function Report({ run, history, today }: { run: StoredRun; history: RunSummary[]; today: string }) {
  const failing = run.results.filter((r) => r.status === 'fail')
  const warning = run.results.filter((r) => r.status === 'warn')
  const rest = run.results.filter((r) => r.status === 'ok' || r.status === 'info')
  const verdict = verdictOf({ failCount: run.fail_count, warnCount: run.warn_count })

  const days = dailyStates(history, today, 30)
  const streak = cleanStreak(days)

  const headline =
    verdict === 'clear'
      ? 'Everything adds up'
      : verdict === 'look'
        ? `Nothing is broken — ${plural(warning.length, 'thing', 'things')} worth a look`
        : `${plural(failing.length, 'rule the books must keep is', 'rules the books must keep are')} broken`

  const sub =
    verdict === 'clear'
      ? `All ${run.results.length} checks passed.`
      : verdict === 'look'
        ? 'Every rule the ledger must keep holds. These are usually a slip, and sometimes on purpose.'
        : 'These should never be true of a ledger. Each one below says what was found and where. You are emailed about this every morning until it is fixed.'

  return (
    <div className="stack-loose mt-8 w-full">
      <div className="app-card">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-paper-dim">
          <span
            className="status-dot"
            style={{ background: verdict === 'clear' ? 'var(--color-jade-bright)' : verdict === 'look' ? 'var(--color-brass-bright)' : 'var(--color-clay-bright)' }}
          />
          <span>
            Checked {when(run.ran_at, today)} · {run.source === 'nightly' ? 'automatic' : 'by hand'}
          </span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-.02em] text-paper">{headline}</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] text-paper-dim">{sub}</p>

        <div className="mt-6 border-t border-ink-800 pt-5">
          <ol
            className="flex gap-[3px]"
            aria-label={`The last 30 days: ${days.filter((d) => d.state === 'clear').length} clear, ${days.filter((d) => d.state === 'look').length} with something to look at, ${days.filter((d) => d.state === 'problem').length} with a broken rule`}
          >
            {days.map((d) => (
              <li
                key={d.date}
                title={`${new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} — ${DAY_WORDS[d.state]}`}
                className="h-6 min-w-0 flex-1 rounded-[3px]"
                style={{ background: DAY_COLOUR[d.state] }}
              />
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-paper-dim">
            Last 30 days
            {streak >= 2 ? ` · no rule broken for ${streak} days in a row` : ''}
          </p>
        </div>
      </div>

      {failing.length > 0 && <Findings title="Needs you" results={failing} />}
      {warning.length > 0 && <Findings title="Worth a look" results={warning} />}

      <details className="app-card group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-semibold text-paper">
          <span>
            {failing.length + warning.length === 0
              ? `All ${rest.length} checks`
              : `The other ${rest.length === 1 ? 'check' : `${rest.length} checks`}`}
          </span>
          <span aria-hidden className="text-paper-dim transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <ul className="mt-4 flex flex-col divide-y divide-ink-800">
          {rest.map((r) => (
            <li key={r.key} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2.5">
                <span className="status-dot mt-[7px]" style={{ background: `var(--color-${DOT[r.status]})` }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-paper">{r.title}</p>
                  <p className="mt-0.5 text-[13px] text-paper">{r.line}</p>
                  <p className="mt-1 max-w-2xl text-[12px] text-paper-dim">{r.why}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function Findings({ title, results }: { title: string; results: CheckResult[] }) {
  return (
    <section>
      <h2 className="text-[14px] font-semibold text-paper">
        {title} <span className="font-normal text-paper-dim">{results.length}</span>
      </h2>
      <div className="app-card mt-3">
        <ul className="flex flex-col divide-y divide-ink-800">
          {results.map((r) => (
            <li key={r.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2.5">
                <span className="status-dot mt-[7px]" style={{ background: `var(--color-${DOT[r.status]})` }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-paper">{r.title}</p>
                  <p className="mt-0.5 text-[13px] text-paper">{r.line}</p>
                  <p className="mt-1 max-w-2xl text-[12px] text-paper-dim">{r.why}</p>

                  {r.samples.length > 0 && (
                    <ul className="mt-3 flex flex-col divide-y divide-ink-800 rounded-lg bg-ink-850 px-3">
                      {r.samples.map((s, i) => (
                        <li key={`${s.id ?? s.label}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-paper">{s.label}</p>
                            <p className="text-[12px] text-paper-dim">{s.detail}</p>
                          </div>
                          {s.dealer_id && (
                            <Link href={`/records?dealer=${s.dealer_id}`} className="shrink-0 text-[12px] font-semibold text-primary-deep hover:underline">
                              See their entries →
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.problems > r.samples.length && r.samples.length > 0 && (
                    <p className="mt-2 text-[12px] text-paper-dim">and {(r.problems - r.samples.length).toLocaleString()} more</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
