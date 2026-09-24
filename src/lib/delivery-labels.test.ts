import { describe, expect, it } from 'vitest'
import { deliverySimLabel, deliveryWhat } from './delivery-labels'

describe('deliveryWhat', () => {
  it('names a package sale by its package and an order by its card count', () => {
    expect(deliveryWhat({ source: 'sale', package: 'C', quantity: null })).toBe('Package C')
    expect(deliveryWhat({ source: 'order', package: null, quantity: 10 })).toBe('10 SIM cards')
    expect(deliveryWhat({ source: 'order', package: null, quantity: 1 })).toBe('1 SIM card')
    expect(deliveryWhat({ source: 'order', package: null, quantity: 1200 })).toBe('1,200 SIM cards')
  })
  it('is a dash when there is nothing to name', () => {
    expect(deliveryWhat({ source: 'sale', package: null, quantity: null })).toBe('—')
    expect(deliveryWhat({ package: null })).toBe('—')
  })
})

describe('deliverySimLabel', () => {
  it('keeps the old wording for package sales', () => {
    expect(deliverySimLabel({ source: 'sale', sim_type: 'physical' })).toBe('Physical SIM')
    expect(deliverySimLabel({ sim_type: 'physical' })).toBe('Physical SIM')
    expect(deliverySimLabel({ source: 'sale', sim_type: 'esim' })).toBe('eSIM')
  })
  it('calls out only the rarer no-number card on an order', () => {
    expect(deliverySimLabel({ source: 'order', sim_type: 'physical' })).toBe('Physical SIM')
    expect(deliverySimLabel({ source: 'order', sim_type: 'physical_no_number' })).toBe('No-number SIM')
  })
})
