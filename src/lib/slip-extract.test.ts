import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareSlipForDealer,
  compareSlipToEntry,
  isComparableReference,
  joinWords,
  MIN_REFERENCE_KEY_LENGTH,
  referenceKey,
  slipDateUsable,
  SLIP_STALE_DAYS,
  type ExtractedSlip,
} from './slip-extract'

const slip = (over: Partial<ExtractedSlip> = {}): ExtractedSlip => ({
  amount_rm: 940,
  paid_on: '2026-09-14',
  bank: 'Maybank',
  reference: 'FT26091412345678',
  recipient: 'CWC Enterprise',
  ...over,
})

describe('referenceKey', () => {
  it('sees the same payment written two ways', () => {
    expect(referenceKey('FT26091412345678')).toBe(referenceKey('ft 2609-1412345678'))
  })

  it('is empty for nothing', () => {
    expect(referenceKey(null)).toBe('')
    expect(referenceKey(undefined)).toBe('')
    expect(referenceKey('  --  ')).toBe('')
  })

  it('a shorthand is not comparable', () => {
    expect(isComparableReference('ref 5512')).toBe(false)
    expect(isComparableReference('5512')).toBe(false)
    expect(isComparableReference('FT2609141')).toBe(true)
    expect(MIN_REFERENCE_KEY_LENGTH).toBe(8)
  })

  // The database compares reference_key; the browser and the server compare this. If the two rules
  // differ, a duplicate is caught in one place and missed in the other.
  it('is the same rule the database keeps in reference_key', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '0057_transaction_reference.sql'), 'utf8')
    expect(sql).toContain("lower(regexp_replace(coalesce(reference, ''), '[^a-zA-Z0-9]', '', 'g'))")
    expect(sql).toContain('length(reference_key) >= ' + MIN_REFERENCE_KEY_LENGTH)
  })

  // SIM stock intakes keep the same key for Vibe's invoice on a delivery of cards (0061).
  it('is the same rule on SIM stock intakes', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '0061_sim_intake_idempotency_and_reference.sql'), 'utf8')
    expect(sql).toContain("lower(regexp_replace(coalesce(reference, ''), '[^a-zA-Z0-9]', '', 'g'))")
    expect(sql).toContain('length(reference_key) >= ' + MIN_REFERENCE_KEY_LENGTH)
  })
})

describe('slipDateUsable', () => {
  const today = '2026-09-16'

  it('uses a recent date', () => {
    expect(slipDateUsable('2026-09-14', today)).toBe(true)
    expect(slipDateUsable('2026-09-16', today)).toBe(true)
  })

  it('never uses a date in the future to overwrite the form', () => {
    expect(slipDateUsable('2026-09-17', today)).toBe(false)
  })

  it('does not use a date old enough to be some other payment', () => {
    expect(slipDateUsable('2026-08-01', today)).toBe(false) // 46 days
    expect(slipDateUsable('2026-08-02', today)).toBe(true) // exactly SLIP_STALE_DAYS
    expect(SLIP_STALE_DAYS).toBe(45)
  })

  it('does not use what is not a date', () => {
    expect(slipDateUsable(null, today)).toBe(false)
    expect(slipDateUsable('14/09/2026', today)).toBe(false)
    expect(slipDateUsable('2026-13-45', today)).toBe(false)
  })
})

describe('compareSlipToEntry', () => {
  const today = '2026-09-16'

  it('is silent when the slip backs the entry', () => {
    expect(compareSlipToEntry({ amountRm: 940, date: '2026-09-14' }, slip(), today)).toEqual([])
  })

  it('a different amount is the one thing that is wrong, not merely worth a look', () => {
    const [f] = compareSlipToEntry({ amountRm: 9400, date: '2026-09-14' }, slip(), today)
    expect(f.kind).toBe('amount')
    expect(f.tone).toBe('bad')
    expect(f.text).toBe('The slip says RM 940.00 — this entry is RM 9,400.00')
  })

  it('does not fuss over a sen of rounding', () => {
    expect(compareSlipToEntry({ amountRm: 940.004, date: '2026-09-14' }, slip(), today)).toEqual([])
  })

  it('says nothing about a field the slip did not show', () => {
    expect(compareSlipToEntry({ amountRm: 500, date: '2026-09-01' }, slip({ amount_rm: null, paid_on: null }), today)).toEqual([])
  })

  it('says nothing when the form has nothing to compare yet', () => {
    expect(compareSlipToEntry({ amountRm: null, date: null }, slip(), today)).toEqual([])
  })

  it('an entry dated after the transfer is a note, not an error', () => {
    // Recorded once someone has caught up: the slip is the 14th, the entry is the 16th.
    const [f] = compareSlipToEntry({ amountRm: 940, date: '2026-09-16' }, slip(), today)
    expect(f.kind).toBe('date')
    expect(f.tone).toBe('warn')
    expect(f.text).toBe('The slip is dated 2026-09-14; this entry is dated 2026-09-16 (2 days apart)')
  })

  it('a slip dated in the future is not a slip', () => {
    const [f] = compareSlipToEntry({ amountRm: 940, date: '2026-09-16' }, slip({ paid_on: '2026-10-02' }), today)
    expect(f.tone).toBe('bad')
    expect(f.text).toMatch(/in the future/)
  })

  it('a day of slack for the phone clock', () => {
    expect(compareSlipToEntry({ amountRm: 940, date: '2026-09-17' }, slip({ paid_on: '2026-09-17' }), today)).toEqual([])
  })

  it('a slip from months ago is questioned', () => {
    const [f] = compareSlipToEntry({ amountRm: 940, date: '2026-09-16' }, slip({ paid_on: '2026-06-01' }), today)
    expect(f.tone).toBe('warn')
    expect(f.text).toMatch(/107 days ago/)
  })

  it('reports amount and date together', () => {
    const kinds = compareSlipToEntry({ amountRm: 5, date: '2026-09-16' }, slip(), today).map((f) => f.kind)
    expect(kinds).toEqual(['amount', 'date'])
  })
})

describe('compareSlipForDealer', () => {
  const today = '2026-09-16'

  it('says nothing when the slip agrees', () => {
    expect(compareSlipForDealer({ amountRm: 940, date: '2026-09-14' }, slip(), today)).toEqual([])
  })

  it('tells the dealer what the slip says and what they typed, in their own terms', () => {
    expect(compareSlipForDealer({ amountRm: 9400, date: '2026-09-14' }, slip(), today)).toEqual([
      'Your slip says RM 940.00, but you entered RM 9,400.00. Please check before sending.',
    ])
  })

  it('questions a slip that cannot be this payment', () => {
    expect(compareSlipForDealer({ amountRm: 940, date: '2026-09-14' }, slip({ paid_on: '2026-10-02' }), today)[0]).toMatch(/has not happened yet/)
    expect(compareSlipForDealer({ amountRm: 940, date: '2026-09-14' }, slip({ paid_on: '2026-06-01' }), today)[0]).toMatch(/107 days ago/)
  })

  it('leaves the date alone when it is only a day or two off — the dealer chose it', () => {
    expect(compareSlipForDealer({ amountRm: 940, date: '2026-09-16' }, slip({ paid_on: '2026-09-14' }), today)).toEqual([])
  })

  it('says nothing about what the slip did not show', () => {
    expect(compareSlipForDealer({ amountRm: 500, date: '2026-09-16' }, slip({ amount_rm: null, paid_on: null }), today)).toEqual([])
  })
})

describe('joinWords', () => {
  it('says a list the way a person would', () => {
    expect(joinWords([])).toBe('')
    expect(joinWords(['the amount'])).toBe('the amount')
    expect(joinWords(['the amount', 'the date'])).toBe('the amount and the date')
    expect(joinWords(['the amount', 'the date', 'the bank'])).toBe('the amount, the date and the bank')
  })
})
