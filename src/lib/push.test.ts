import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const sendNotification = vi.fn()
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }))

const captured: unknown[] = []
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => captured.push(e) }))
vi.mock('@/lib/sentry-report', () => ({ reportToSentry: async (fn: () => void) => fn() }))

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
const state = {
  claims: new Set<string>(),
  claimError: null as { code: string; message: string } | null,
  profiles: [] as { id: string; role: string; active: boolean; notifications_enabled: boolean }[],
  prefs: [] as { user_id: string; category: string; enabled: boolean }[],
  subs: [] as Sub[],
  deleted: [] as string[],
  failed: [] as string[],
  touched: false,
}

function fakeDb() {
  state.touched = true
  return {
    from(table: string) {
      if (table === 'push_events') {
        return {
          insert: async (row: { ref_kind: string; ref_id: string }) => {
            if (state.claimError) return { error: state.claimError }
            const key = `${row.ref_kind}:${row.ref_id}`
            if (state.claims.has(key)) return { error: { code: '23505', message: 'duplicate' } }
            state.claims.add(key)
            return { error: null }
          },
        }
      }
      if (table === 'dealers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { company_name: 'Ipoh Reload' } }) }) }) }
      if (table === 'profiles') return { select: () => ({ in: async () => ({ data: state.profiles }) }) }
      if (table === 'notification_preferences') return { select: () => ({ eq: async () => ({ data: state.prefs }) }) }
      if (table === 'push_subscriptions') {
        return {
          select: () => ({ in: async (_c: string, ids: string[]) => ({ data: state.subs.filter((s) => ids.includes(s.user_id)) }) }),
          delete: () => ({ in: async (_c: string, ids: string[]) => void state.deleted.push(...ids) }),
          update: () => ({ in: async (_c: string, ids: string[]) => void state.failed.push(...ids) }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => fakeDb() }))

import { notifyShipQueue } from './push'

const order = { kind: 'sim_order' as const, refId: 'order-1', dealerId: 'd1', actorId: 'cs1', quantity: 12, simType: 'physical' }
const sub = (id: string, user_id: string): Sub => ({ id, user_id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a' })

beforeEach(() => {
  vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
  vi.stubEnv('VAPID_SUBJECT', 'https://cwc456.com')
  sendNotification.mockReset()
  sendNotification.mockResolvedValue({ statusCode: 201 })
  captured.length = 0
  Object.assign(state, {
    claims: new Set<string>(),
    claimError: null,
    profiles: [
      { id: 'owner', role: 'master', active: true, notifications_enabled: true },
      { id: 'cs1', role: 'cs', active: true, notifications_enabled: true },
      { id: 'cs2', role: 'cs', active: true, notifications_enabled: true },
    ],
    prefs: [],
    subs: [sub('s-owner', 'owner'), sub('s-cs1', 'cs1'), sub('s-cs2', 'cs2')],
    deleted: [],
    failed: [],
    touched: false,
  })
})

describe('notifyShipQueue', () => {
  it('pushes to everyone who ships except the person who placed the order', async () => {
    await notifyShipQueue(order)
    const endpoints = sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint).sort()
    expect(endpoints).toEqual(['https://push.example/s-cs2', 'https://push.example/s-owner'])
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string)
    expect(payload).toEqual({ title: 'New SIM order to ship', body: 'Ipoh Reload — 12 SIM cards', url: '/delivery', tag: 'delivery-order-1' })
  })

  it('announces a package sale with its package', async () => {
    await notifyShipQueue({ kind: 'package_sale', refId: 't-1', dealerId: 'd1', actorId: 'acct', quantity: 2, pkg: 'C' })
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string).body).toBe('Ipoh Reload — Package C × 2 (physical SIM)')
  })

  it('stays quiet the second time for the same order (double-tap, retry)', async () => {
    await notifyShipQueue(order)
    const first = sendNotification.mock.calls.length
    await notifyShipQueue(order)
    expect(sendNotification.mock.calls.length).toBe(first)
  })

  it('honours a person who switched Deliveries off', async () => {
    state.prefs = [{ user_id: 'owner', category: 'deliveries', enabled: false }]
    await notifyShipQueue(order)
    expect(sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint)).toEqual(['https://push.example/s-cs2'])
  })

  it('does nothing at all when phone alerts are not set up', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    await notifyShipQueue(order)
    expect(sendNotification).not.toHaveBeenCalled()
    expect(state.touched).toBe(false)
  })

  it('removes a phone the push service says is gone (410) and keeps one that merely failed (500)', async () => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('s-owner')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      throw Object.assign(new Error('boom'), { statusCode: 500 })
    })
    await notifyShipQueue(order)
    expect(state.deleted).toEqual(['s-owner'])
    expect(state.failed).toEqual(['s-cs2'])
    expect(captured).toHaveLength(0)
  })

  it('reports a refused message (a wrong VAPID key looks like a 401) instead of swallowing it', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('bad vapid'), { statusCode: 401 }))
    await notifyShipQueue(order)
    expect(captured).toHaveLength(1)
    expect(String((captured[0] as Error).message)).toContain('401')
  })

  it('never throws, and reports, when the database misbehaves', async () => {
    state.claimError = { code: 'XX000', message: 'db down' }
    await expect(notifyShipQueue(order)).resolves.toBeUndefined()
    expect(captured).toHaveLength(1)
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
