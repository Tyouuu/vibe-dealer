import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { formatMYR } from '@/lib/money'
import { todayInMalaysia } from '@/lib/month'
import { LogoMark } from '../../(app)/icons'
import { RequestForm } from './request-form'
import { typicalAmount } from '@/lib/amount-plausibility'

// The only page in this app a person outside the company ever sees.
//
// No login, because the 284 dealers are not users of this system and never
// will be — 0038 and the payment-collection note both landed on the same
// conclusion, that per-dealer accounts mean per-dealer passwords, resets and
// support for a business with two people in the office. A link identifies the
// dealer instead, and identification is enough because the page cannot move
// money. It puts a claim in a queue.
export const metadata: Metadata = {
  title: 'Request a top-up — Vibe456',
  // Not a page for search engines, and the token in the URL is not a thing to
  // publish. The root layout already sets this; repeated here because this
  // route is the one where it matters.
  robots: { index: false, follow: false },
}

type PageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ sent?: string; error?: string }>
}

type RequestRow = {
  id: string
  type: string
  money_rm: string | number | null
  package: string | null
  status: string
  reject_reason: string | null
  created_at: string
}

function whenInMalaysia(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function DealerRequestPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { sent, error } = await searchParams

  const supabase = createServiceClient()
  const { data: dealer } = await supabase
    .from('dealers')
    .select('id, company_name, rate, package, status')
    .eq('submit_token', token)
    .maybeSingle()

  if (!dealer || dealer.status !== 'active') return <LinkNotActive />

  const { data: recent } = await supabase
    .from('topup_requests')
    .select('id, type, money_rm, package, status, reject_reason, created_at')
    .eq('dealer_id', dealer.id)
    .order('created_at', { ascending: false })
    .limit(8)

  // What this dealer actually recorded, not what they have claimed — a
  // request that was never verified could itself be the typo the nudge below
  // exists to catch, so the baseline is built from settled transactions only.
  const { data: pastTopups } = await supabase
    .from('transactions')
    .select('money_rm')
    .eq('dealer_id', dealer.id)
    .eq('type', 'topup')
    .eq('status', 'verified')
    .order('tx_date', { ascending: false })
    .limit(20)
  const typicalTopupRm = typicalAmount((pastTopups ?? []).map((t) => Number(t.money_rm)))

  // <header> and <main>, like every signed-in page gets from the app shell.
  //
  // This page has none of that shell — it is the one screen someone outside
  // the company ever sees, and it was built as bare divs, so it had no
  // landmarks at all: axe reported landmark-one-main plus twelve separate
  // pieces of content sitting outside any region. It had never been caught
  // because every audit and sweep in this repo signs in first, and signing in
  // is exactly what this page exists to avoid.
  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto w-full max-w-[440px]">
        <header className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">Vibe456</span>
        </header>

        <main>

        {/* Their own name, first and unmistakable. A dealer sent the wrong
            link by mistake should find out here, not after submitting. */}
        <div className="app-card p-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-paper-dim">Requesting as</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-paper">{dealer.company_name}</h1>
          <p className="mt-1.5 text-[13px] text-paper-dim">
            Not you? Don&apos;t use this link — ask us for your own.
          </p>
        </div>

        {sent && (
          <div className="alert alert-good mt-4">
            Sent. We&apos;ll check the payment and confirm — you can come back to this link any time to see where it is.
          </div>
        )}
        {error && <div className="alert alert-bad mt-4">{error}</div>}

        {/* today from the server, not the phone. The date field decides which
            month a sale lands in, and a handset with the wrong clock would put
            it in the wrong one silently. */}
        <RequestForm token={token} rate={dealer.rate == null ? null : Number(dealer.rate)} today={todayInMalaysia()} typicalAmountRm={typicalTopupRm} />

        {recent && recent.length > 0 && (
          <div className="app-card mt-4 p-6">
            <h2 className="text-[14px] font-semibold text-paper">Your recent requests</h2>
            <p className="mt-1 text-[13px] text-paper-dim">
              This is everything you&apos;ve sent through this link, and where each one got to.
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-ink-800">
              {(recent as RequestRow[]).map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-paper">
                      {r.type === 'topup' ? `Top-up ${formatMYR(Number(r.money_rm ?? 0))}` : `Package ${r.package}`}
                    </p>
                    <p className="text-[12px] text-paper-dim">{whenInMalaysia(r.created_at)}</p>
                    {/* A rejection without its reason is the message that
                        starts a phone call. */}
                    {r.status === 'rejected' && r.reject_reason && (
                      <p className="mt-1 text-[12px] text-clay-bright">{r.reject_reason}</p>
                    )}
                  </div>
                  <StatusWord status={r.status} />
                </li>
              ))}
            </ul>
          </div>
        )}

          <p className="mt-6 text-center text-[12px] text-paper-dim">
            Nothing is confirmed until we&apos;ve checked the payment. This page never shows your balance or your account.
          </p>
        </main>
      </div>
    </div>
  )
}

// Words, not colours alone — this is read on a phone in daylight by someone
// who has never seen this product before and has no legend to consult.
function StatusWord({ status }: { status: string }) {
  const label = status === 'pending' ? 'Waiting for us' : status === 'accepted' ? 'Confirmed' : 'Not accepted'
  // brass-bright, not brass. #a8710a on white is 4.17:1 — under the 4.5 AA
  // floor — and "Waiting for us" is the status word every pending request
  // carries, read on a phone in daylight by someone outside the company.
  // #8a5d08 is 5.75:1 and is the same token the app's own pending states use.
  const tone = status === 'pending' ? 'text-brass-bright' : status === 'accepted' ? 'text-jade' : 'text-clay-bright'
  return <span className={`shrink-0 text-[13px] font-semibold ${tone}`}>{label}</span>
}

function LinkNotActive() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Same landmarks as the live version of this page above. A dead link
            is the more likely of the two to be opened by a stranger. */}
        <header className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">Vibe456</span>
        </header>
        <main className="app-card p-7 text-center">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-paper">This link isn&apos;t active</h1>
          {/* One sentence for a token that never existed and one whose dealer
              has been switched off. Saying which would let anyone guessing
              learn which guesses were right. */}
          <p className="mt-2 text-[13px] leading-relaxed text-paper-dim">
            It may have been replaced, or the account may have changed. WhatsApp us and we&apos;ll send you a new one.
          </p>
        </main>
      </div>
    </div>
  )
}
