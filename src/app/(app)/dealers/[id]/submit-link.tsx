'use client'

import { useState } from 'react'

// The dealer's own link, ready to send.
//
// The origin comes from the request on the server (lib/site-url.ts) rather
// than from window, so the URL is fully formed in the first HTML the page
// sends. A link that is blank until hydration is one somebody copies half of.
export function SubmitLink({
  origin,
  token,
  companyName,
  whatsapp,
}: {
  origin: string
  token: string
  companyName: string
  whatsapp: string | null
}) {
  const [copied, setCopied] = useState(false)

  const url = `${origin}/r/${token}`

  // Malaysian numbers are stored as 012-3456789; wa.me wants 60123456789.
  const waNumber = whatsapp?.replace(/\D/g, '').replace(/^0/, '60') ?? null
  const message = `Hi ${companyName}, you can send us your top-up requests here: ${url}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked in some embedded browsers. The input below is
      // selectable, so there is always a way through.
      setCopied(false)
    }
  }

  return (
    <div className="app-card">
      <h3 className="mb-1 text-sm font-semibold text-paper">Their request link</h3>
      <p className="text-[12px] leading-relaxed text-paper-dim">
        Send this over WhatsApp. They can ask for a top-up or a package without messaging anyone, and it lands in Dealer Requests.
      </p>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="field-input mt-3 font-mono text-[12px]"
        aria-label={`Request link for ${companyName}`}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="btn-ghost py-1.5 text-xs">
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {waNumber && (
          <a
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-paper-dim hover:text-paper hover:underline"
          >
            Send on WhatsApp
          </a>
        )}
      </div>
      {!whatsapp && (
        // Not a nag: without a number there is no way to send it, and this is
        // the screen where that gets fixed.
        <p className="mt-2 text-[12px] text-paper-dim">No WhatsApp number saved — add one and you can send this in one tap.</p>
      )}
    </div>
  )
}
