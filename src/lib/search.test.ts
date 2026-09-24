import { describe, expect, it } from 'vitest'
import { dealerMatchNote, dealerOtherMatch, dealerSearchFilter, sanitizeSearchTerm } from './search'

const dealer = { company_name: 'AMC TELECOMMUNICATION', contact_person: 'Tan Wei Ming', phone: '0123456789', whatsapp: null }

describe('sanitizeSearchTerm', () => {
  it('removes characters that would break out of a PostgREST filter', () => {
    expect(sanitizeSearchTerm(' a,b(c)%d* ')).toBe('abcd')
  })
})

describe('dealerSearchFilter', () => {
  it('matches every column the row can be found by', () => {
    const f = dealerSearchFilter('wei')
    for (const c of ['company_name', 'company_no', 'contact_person', 'phone', 'whatsapp', 'region']) expect(f).toContain(`${c}.ilike.%wei%`)
  })
})

describe('dealerMatchNote', () => {
  it('says which hidden field matched, keeping the original casing', () => {
    expect(dealerMatchNote(dealer, 'WEI')).toEqual({ label: 'Contact', before: 'Tan ', hit: 'Wei', after: ' Ming' })
  })
  it('finds a phone number', () => {
    expect(dealerMatchNote(dealer, '3456')).toEqual({ label: 'Phone', before: '012', hit: '3456', after: '789' })
  })
  it('stays quiet when the company name matched', () => {
    expect(dealerMatchNote(dealer, 'amc')).toBeNull()
  })
  it('stays quiet when nothing hidden matched or the search is empty', () => {
    expect(dealerMatchNote(dealer, 'zzz')).toBeNull()
    expect(dealerMatchNote(dealer, '  ')).toBeNull()
  })
})

describe('dealerOtherMatch', () => {
  const d = { company_no: '202203187574 (RA0089850-V)', phone: '0123456789', contact_person: 'Tan Wei Ming' }
  it('names the field a hit came from', () => {
    expect(dealerOtherMatch(d, 'ra0089')).toEqual({ label: 'Reg. no.', value: '202203187574 (RA0089850-V)' })
    expect(dealerOtherMatch(d, '3456')).toEqual({ label: 'Phone', value: '0123456789' })
    expect(dealerOtherMatch(d, 'wei')).toEqual({ label: 'Contact', value: 'Tan Wei Ming' })
  })
  it('is null when nothing else matches', () => {
    expect(dealerOtherMatch(d, 'zzz')).toBeNull()
    expect(dealerOtherMatch(d, '')).toBeNull()
  })
})
