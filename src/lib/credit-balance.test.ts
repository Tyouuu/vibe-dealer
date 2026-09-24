import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAvailableBalance, getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from './credit-balance'
import { PACKAGES } from './packages'

describe('computeAvailableBalance', () => {
  it('is total purchased minus total committed', () => {
    expect(computeAvailableBalance(1000, 600)).toBe(400)
  })

  it('blocks a sale bigger than what remains (New Transaction hard-block)', () => {
    const available = computeAvailableBalance(1000, 600)
    const requestedSale = 500
    expect(requestedSale > available).toBe(true)
  })

  it('allows a sale that fits within what remains', () => {
    const available = computeAvailableBalance(1000, 600)
    const requestedSale = 400
    expect(requestedSale > available).toBe(false)
  })

  it('goes negative if more was committed than purchased (already-oversold state, not clamped)', () => {
    expect(computeAvailableBalance(500, 600)).toBe(-100)
  })

  it('treats zero purchases as zero balance, not a crash', () => {
    expect(computeAvailableBalance(0, 0)).toBe(0)
  })
})

describe('LOW_BALANCE_THRESHOLD', () => {
  it('equals the biggest package size, so it always warns before the next big sale would be blocked', () => {
    const biggest = Math.max(...Object.values(PACKAGES).map((p) => p.reload))
    expect(LOW_BALANCE_THRESHOLD).toBe(biggest)
    expect(LOW_BALANCE_THRESHOLD).toBe(PACKAGES.C.reload)
  })
})

// A stand-in client whose get_credit_balance answers are queued, one per call.
function clientReturning(...answers: { data: unknown; error: { message: string } | null }[]) {
  let calls = 0
  const client = { rpc: () => ({ single: async () => answers[Math.min(calls++, answers.length - 1)] }) } as unknown as SupabaseClient
  return { client, calls: () => calls }
}
const ok = { data: { total_purchased: 1000, total_committed: 600, available: 400 }, error: null }

describe('getAvailablePointsBalance', () => {
  it('returns the balance the database worked out', async () => {
    const { client } = clientReturning(ok)
    expect(await getAvailablePointsBalance(client)).toEqual({ available: 400, totalPurchased: 1000, totalCommitted: 600 })
  })

  it('retries once, so a single timeout is not a failure', async () => {
    const { client, calls } = clientReturning({ data: null, error: { message: 'canceling statement due to statement timeout' } }, ok)
    expect((await getAvailablePointsBalance(client)).available).toBe(400)
    expect(calls()).toBe(2)
  })

  it('throws rather than reporting a balance of zero when it cannot read one', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'statement timeout' } })
    await expect(getAvailablePointsBalance(client)).rejects.toThrow('statement timeout')
  })

  it('a genuine zero balance is still zero', async () => {
    const { client } = clientReturning({ data: { total_purchased: 0, total_committed: 0, available: 0 }, error: null })
    expect((await getAvailablePointsBalance(client)).available).toBe(0)
  })
})
