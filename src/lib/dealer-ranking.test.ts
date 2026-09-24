import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// dealer-ranking.ts is server-only, and reports failures to Sentry; neither belongs in a unit test.
vi.mock('server-only', () => ({}))
const reported = vi.fn()
vi.mock('@/lib/sentry-report', () => ({ reportToSentry: (fn: () => void) => reported(fn) }))
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }))

import { getDealerRankingMap } from './dealer-ranking'

// A stand-in client whose get_dealer_points_ranking answers are queued, one per call.
function clientReturning(...answers: { data: unknown; error: { message: string } | null }[]) {
  let calls = 0
  const client = { rpc: async () => answers[Math.min(calls++, answers.length - 1)] } as unknown as SupabaseClient
  return { client, calls: () => calls }
}

const rows = [
  { dealer_id: 'a', total_points: 9000 },
  { dealer_id: 'b', total_points: 4000 },
]

describe('getDealerRankingMap', () => {
  it('ranks dealers by the order the database returns them', async () => {
    const { client } = clientReturning({ data: rows, error: null })
    const { map, unavailable } = await getDealerRankingMap(client)
    expect(unavailable).toBe(false)
    expect(map.get('a')).toEqual({ totalPoints: 9000, rank: 1 })
    expect(map.get('b')).toEqual({ totalPoints: 4000, rank: 2 })
  })

  it('a database with no top-ups is an empty ranking that is AVAILABLE', async () => {
    // "Nobody has topped up" and "we could not ask" must stay different answers.
    const { client } = clientReturning({ data: [], error: null })
    const { map, unavailable } = await getDealerRankingMap(client)
    expect(map.size).toBe(0)
    expect(unavailable).toBe(false)
  })

  it('does not retry a read that worked', async () => {
    const { client, calls } = clientReturning({ data: rows, error: null })
    await getDealerRankingMap(client)
    expect(calls()).toBe(1)
  })

  it('retries once, so a single timeout is not a failure', async () => {
    const { client, calls } = clientReturning({ data: null, error: { message: 'canceling statement due to statement timeout' } }, { data: rows, error: null })
    const { map, unavailable } = await getDealerRankingMap(client)
    expect(unavailable).toBe(false)
    expect(map.size).toBe(2)
    expect(calls()).toBe(2)
  })

  it('says UNAVAILABLE, and reports it, when it cannot read — never an empty ranking that looks like a fact', async () => {
    reported.mockClear()
    const { client, calls } = clientReturning({ data: null, error: { message: 'statement timeout' } })
    const { map, unavailable } = await getDealerRankingMap(client)
    expect(unavailable).toBe(true)
    expect(map.size).toBe(0)
    expect(calls()).toBe(2)
    expect(reported).toHaveBeenCalledTimes(1)
  })
})
