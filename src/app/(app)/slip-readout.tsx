import { formatMYR } from '@/lib/money'
import { joinWords, type SlipFinding } from '@/lib/slip-extract'
import type { SlipState } from './use-slip-reader'

// What was read off the slip, shown under the attach box and always as a reading — with what it
// disagrees with, and whether the same slip is already in the books.
//
// It states what it did to the form ("filled in the amount") rather than doing it silently: a field that
// changed under someone's hands with no word about why is the kind of surprise that ends with them
// trusting nothing on the page.

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

export function SlipReadout({
  state,
  findings,
  filled,
}: {
  state: SlipState
  findings: SlipFinding[]
  /** The form fields the reading filled in, in words: ["the amount", "the date"]. */
  filled: string[]
}) {
  if (state.status === 'idle') return null

  return (
    <div aria-live="polite" className="mt-2.5 rounded-xl border border-ink-800 bg-ink-850/50 px-3.5 py-3 text-[12px]">
      {state.status === 'reading' && <p className="text-paper-dim">Reading the slip…</p>}

      {state.status === 'failed' && <p className="text-paper-dim">{state.message}</p>}

      {state.status === 'done' && (
        <>
          <p className="font-semibold text-paper">Read from the slip</p>
          {state.slip.amount_rm == null && !state.slip.paid_on && !state.slip.bank && !state.slip.reference ? (
            <p className="mt-1 text-paper-dim">Nothing legible on it — check the image and type the figures in.</p>
          ) : (
            <p className="mt-1 text-paper-dim">
              {[
                state.slip.amount_rm != null ? formatMYR(state.slip.amount_rm) : null,
                state.slip.paid_on ? dateLabel(state.slip.paid_on) : null,
                state.slip.bank,
                state.slip.reference ? `ref ${state.slip.reference}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {filled.length > 0 && <p className="mt-1 text-paper-dim">Filled in {joinWords(filled)} above — change it if it is wrong.</p>}

          {findings.map((f) => (
            <p key={f.kind + f.text} className={`mt-1.5 font-semibold ${f.tone === 'bad' ? 'text-clay-bright' : 'text-brass-bright'}`}>
              {f.text}
            </p>
          ))}

          {state.duplicate && (
            <p className="mt-1.5 rounded-lg border border-clay/25 bg-clay/8 px-2.5 py-2 font-semibold text-paper">
              This slip is already recorded — {state.duplicate.label}, {dateLabel(state.duplicate.date)}, {formatMYR(state.duplicate.moneyRm)}
              {state.duplicate.status === 'pending' ? ' (waiting to be verified)' : ''}. Recording it again counts one payment twice.
            </p>
          )}

          {findings.length === 0 && !state.duplicate && (state.slip.amount_rm != null || state.slip.paid_on) && (
            <p className="mt-1.5 text-paper-dim">The slip agrees with this entry.</p>
          )}
          <p className="mt-1.5 text-paper-dim">This is a reading of the picture, not a record. Nothing is saved until you submit.</p>
        </>
      )}
    </div>
  )
}
