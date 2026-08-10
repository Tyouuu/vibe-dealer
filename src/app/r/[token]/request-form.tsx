'use client'

import { useState } from 'react'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { ACCEPT_ATTR } from '@/lib/vision-extract'
import { submitRequest } from './actions'
import { IconUpload } from '../../(app)/icons'

// Written for a phone, held one-handed, by someone who has used this once
// before. Every control is full-width and thumb-sized, there is one decision
// per row, and the only number typed is the one they already know: what they
// transferred.
export function RequestForm({ token, rate }: { token: string; rate: number | null }) {
  // A dealer with no package has no rate, so there is no way to price the
  // points their money would buy — /entry refuses the same sale for the same
  // reason. Rather than let them send something that can only be rejected,
  // the choice is not offered and the page says why. 242 of 284 dealers are
  // in exactly this state today, so this is the common case, not the edge.
  const canTopUp = rate != null

  const [type, setType] = useState<'topup' | 'package'>(canTopUp ? 'topup' : 'package')
  const [money, setMoney] = useState('')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [slipName, setSlipName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const amount = Number(money)
  const points = canTopUp && Number.isFinite(amount) && amount > 0 ? Math.round(amount / (1 - rate / 100)) : null

  return (
    <form
      action={async (formData) => {
        setSubmitting(true)
        try {
          await submitRequest(formData)
        } finally {
          setSubmitting(false)
        }
      }}
      className="app-card mt-4 flex flex-col gap-5 p-6"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value={type} />

      <div>
        <h2 className="text-[15px] font-semibold text-paper">What would you like?</h2>
        {canTopUp ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Choice active={type === 'topup'} onClick={() => setType('topup')} label="Top up credit" />
            <Choice active={type === 'package'} onClick={() => setType('package')} label="Buy a package" />
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-paper-dim">
            Your account doesn&apos;t have a package yet, so credit top-ups aren&apos;t available. Choose a package below and we&apos;ll set
            you up.
          </p>
        )}
      </div>

      {type === 'topup' ? (
        <div>
          <label className="field-label" htmlFor="money_rm">
            How much did you transfer?
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-paper-dim">
              RM
            </span>
            <input
              id="money_rm"
              name="money_rm"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              required
              value={money}
              onChange={(e) => setMoney(e.target.value)}
              placeholder="500.00"
              className="field-input pl-11 text-[16px]"
            />
          </div>
          {/* Shown so the ask is unambiguous on both sides. It is what their
              own rate works out to — not a quote, and not a promise the
              points are reserved.

              Before an amount is typed this said nothing, in a reserved blank
              line — a hole in the form with no explanation for it. It now says
              what is about to happen instead, which is the same height and
              actually earns it. */}
          <p className="mt-2 text-[12px] text-paper-dim">
            {points
              ? `That works out to about ${points.toLocaleString()} points at your rate.`
              : "We'll work out the points from your rate once you enter the amount."}
          </p>
        </div>
      ) : (
        <div>
          <span className="field-label">Which package?</span>
          <div className="flex flex-col gap-2">
            {(Object.keys(PACKAGES) as PackageCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setPkg(code)}
                aria-pressed={pkg === code}
                className={`flex items-baseline justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  pkg === code ? 'border-paper bg-ink-850' : 'border-ink-800 hover:border-paper'
                }`}
              >
                <span className="text-[14px] font-semibold text-paper">{PACKAGES[code].name}</span>
                <span className="text-[13px] tabular-nums text-paper-dim">
                  RM{PACKAGES[code].price} · {PACKAGES[code].reload} pts
                </span>
              </button>
            ))}
          </div>
          <input type="hidden" name="package" value={pkg} />
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="note">
          Anything we should know? <span className="font-normal text-paper-dim">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder="e.g. transferred from Maybank at 3pm"
          className="field-input resize-none"
        />
      </div>

      <div>
        <span className="field-label">
          Payment slip <span className="font-normal text-paper-dim">(optional)</span>
        </span>
        <label className="upload-box">
          <IconUpload />
          <span className={slipName ? 'truncate' : 'min-w-0 text-left'}>{slipName ?? 'Attach a photo of the transfer'}</span>
          <input
            type="file"
            name="slip"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => setSlipName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        {/* Said plainly, because a dealer who thinks the slip is what gets
            them credited will wait for the wrong thing. */}
        <p className="mt-2 text-[12px] text-paper-dim">We check the bank either way — this just helps us find it faster.</p>
      </div>

      <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-[15px]">
        {submitting ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-3 py-3 text-[14px] font-semibold transition-colors ${
        active ? 'border-paper bg-ink-850 text-paper' : 'border-ink-800 text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {label}
    </button>
  )
}
