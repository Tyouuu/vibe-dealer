import { describe, expect, it } from 'vitest'
import { pickRecipients, type PushProfile } from './push-recipients'

const p = (id: string, role: string, over: Partial<PushProfile> = {}): PushProfile => ({ id, role, active: true, notifications_enabled: true, ...over })
const staff = [p('owner', 'master'), p('acct', 'accountant'), p('cs1', 'cs'), p('cs2', 'cs')]

describe('pickRecipients (deliveries)', () => {
  it('goes to the roles that ship: master and cs, never the accountant', () => {
    expect(pickRecipients(staff, [], 'deliveries').sort()).toEqual(['cs1', 'cs2', 'owner'])
  })
  it('skips the person who placed the order', () => {
    expect(pickRecipients(staff, [], 'deliveries', 'cs1').sort()).toEqual(['cs2', 'owner'])
  })
  it('respects the master switch and the category switch', () => {
    const people = [p('owner', 'master'), p('cs1', 'cs', { notifications_enabled: false }), p('cs2', 'cs')]
    expect(pickRecipients(people, [{ user_id: 'cs2', category: 'deliveries', enabled: false }], 'deliveries')).toEqual(['owner'])
  })
  it('a different category switched off does not silence deliveries', () => {
    expect(pickRecipients([p('cs1', 'cs')], [{ user_id: 'cs1', category: 'dealer_activity', enabled: false }], 'deliveries')).toEqual(['cs1'])
  })
  it('skips anyone switched off in the app, and treats a missing flag as on', () => {
    expect(pickRecipients([p('cs1', 'cs', { active: false }), p('cs2', 'cs', { active: null, notifications_enabled: null })], [], 'deliveries')).toEqual(['cs2'])
  })
})
