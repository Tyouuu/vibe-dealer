import Link from 'next/link'
import { formatDateLabel } from '@/lib/month'
import type { GapFinding, GapTx } from '@/lib/reconcile-gap'

function Row({ tx }: { tx: GapTx }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-ink-800 py-2 first:border-t-0">
      <span className="min-w-0 truncate text-[13px] text-paper">
        <Link href={`/dealers/${tx.dealerId}`} className="font-semibold hover:text-jade-bright hover:underline">
          {tx.dealerName}
        </Link>{' '}
        <span className="text-paper-dim">· {formatDateLabel(tx.txDate)}</span>
      </span>
      <span className="figure-points shrink-0 text-[13px] font-semibold text-paper">{tx.points.toLocaleString()} pts</span>
    </li>
  )
}

// What the search in lib/reconcile-gap.ts found, put in front of the person
// who has to act on it. This is arithmetic, not AI — see the comment on
// findReconciliationGapLeads for why a deterministic search is the honest
// answer here rather than a model call.
export function GapLeads({ findings }: { findings: GapFinding[] }) {
  if (findings.length === 0) return null
  const first = findings[0]

  if (first.kind === 'gap-negative') {
    return (
      <div className="page-band">
        <h2 className="text-sm font-semibold text-paper">Where the difference might be</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
          Vibe&apos;s statement is the larger side, so the gap is something they counted that isn&apos;t in your list at all —
          not a row to find here. Check for a sale that was verified after Vibe&apos;s own cutoff, or one still sitting in{' '}
          <Link href="/records?status=pending" className="font-semibold text-primary hover:underline">
            pending review
          </Link>
          .
        </p>
      </div>
    )
  }

  if (first.kind === 'no-lead') {
    return (
      <div className="page-band">
        <h2 className="text-sm font-semibold text-paper">Where the difference might be</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
          No single transaction, pair, or month-end entry adds up to this exactly — this one will need a manual look
          through Transactions.
        </p>
      </div>
    )
  }

  return (
    <div className="page-band">
      <h2 className="text-sm font-semibold text-paper">Where the difference might be</h2>
      {first.kind === 'exact-single' && (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
            One transaction matches the gap exactly — worth checking whether it reached Vibe.
          </p>
          <ul className="mt-3">
            <Row tx={first.tx} />
          </ul>
        </>
      )}
      {first.kind === 'exact-pair' && (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
            {findings.length === 1 ? 'These two transactions add up to' : `${findings.length} different pairs add up to`} the
            gap exactly.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {findings.map((f, i) =>
              f.kind === 'exact-pair' ? (
                <ul key={i} className={findings.length > 1 ? 'rounded-lg border border-ink-800 px-3' : ''}>
                  <Row tx={f.a} />
                  <Row tx={f.b} />
                </ul>
              ) : null
            )}
          </div>
        </>
      )}
      {first.kind === 'boundary' && (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
            Nothing adds up to the gap exactly, but these were recorded right at the end of the month — the classic case
            of landing on one side of Vibe&apos;s cutoff and not the other. Worth checking first.
          </p>
          <ul className="mt-3">
            {first.txs.map((tx) => (
              <Row key={tx.id} tx={tx} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
