import { generateReportSummary } from './actions'

// A plain form, no client state — the only interaction is "press the button,
// wait for the page to come back with a paragraph in it", which a Server
// Action redirect already does on its own. Nothing here needs useState.
export function ReportSummaryCard({
  month,
  summary,
  stale,
  error,
}: {
  month: string
  summary: string | null
  stale: boolean
  error?: string
}) {
  return (
    <div className="app-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-wide text-paper-dim">AI summary</div>
          {summary && !stale ? (
            <p className="mt-1.5 text-[14px] leading-relaxed text-paper">{summary}</p>
          ) : (
            <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
              {stale
                ? "The figures have moved since this was written — regenerate it for a summary that matches what's on screen now."
                : 'Turns the numbers on this page into a couple of plain sentences you can skim.'}
            </p>
          )}
          {summary && stale && (
            <p className="mt-2 text-[13px] leading-relaxed text-paper-dim/70 italic">Last version: {summary}</p>
          )}
          {error && <p className="mt-2 text-[12px] font-medium text-clay-bright">{error}</p>}
        </div>
        <form action={generateReportSummary} className="shrink-0">
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="btn-ghost py-1.5 text-xs">
            {summary ? (stale ? 'Regenerate' : 'Regenerate') : 'Generate summary'}
          </button>
        </form>
      </div>
    </div>
  )
}
