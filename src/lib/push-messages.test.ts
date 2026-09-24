import { describe, expect, it } from 'vitest'
import { packagePush, simOrderPush, testPush } from './push-messages'

describe('simOrderPush', () => {
  it('says who and how many, and opens the delivery queue', () => {
    expect(simOrderPush({ refId: 'abc', dealer: 'Bukit Mertajam Phone Zone', quantity: 12, simType: 'physical' })).toEqual({
      title: 'New SIM order to ship',
      body: 'Bukit Mertajam Phone Zone — 12 SIM cards',
      url: '/delivery',
      tag: 'delivery-abc',
    })
  })
  it('handles one card, thousands, and the no-number type', () => {
    expect(simOrderPush({ refId: 'a', dealer: 'X', quantity: 1, simType: 'physical' }).body).toBe('X — 1 SIM card')
    expect(simOrderPush({ refId: 'a', dealer: 'X', quantity: 1500, simType: 'physical' }).body).toBe('X — 1,500 SIM cards')
    expect(simOrderPush({ refId: 'a', dealer: 'X', quantity: 20, simType: 'physical_no_number' }).body).toBe('X — 20 no-number SIM cards')
  })
  it('cuts a very long dealer name so the lock screen stays readable', () => {
    const body = simOrderPush({ refId: 'a', dealer: 'A'.repeat(200), quantity: 10, simType: 'physical' }).body
    expect(body.startsWith('A'.repeat(59) + '…')).toBe(true)
    expect(body.length).toBeLessThan(90)
  })
})

describe('packagePush', () => {
  it('names the package and the count, never a price', () => {
    const p = packagePush({ refId: 'r', dealer: 'Ipoh Reload', pkg: 'C', quantity: 3 })
    expect(p.body).toBe('Ipoh Reload — Package C × 3 (physical SIM)')
    expect(packagePush({ refId: 'r', dealer: 'Ipoh Reload', pkg: 'A', quantity: 1 }).body).toBe('Ipoh Reload — Package A (physical SIM)')
    expect(JSON.stringify(p)).not.toMatch(/RM|pts|points|\d{3,}/)
  })
})

describe('testPush', () => {
  it('opens Account, not the queue', () => {
    expect(testPush().url).toBe('/account')
  })
})
