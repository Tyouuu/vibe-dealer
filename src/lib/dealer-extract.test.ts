import { describe, expect, it } from 'vitest'
import {
  DEALER_EXTRACTION_SCHEMA,
  isEmptyExtraction,
  normalizeExtractedDealer,
  normalizeMalaysianPhone,
} from './dealer-extract'

describe('normalizeMalaysianPhone', () => {
  it('settles the shapes a Malaysian number actually arrives in on one format', () => {
    // The same mobile number, as five people would send it.
    for (const written of ['0123456789', '012-345 6789', '012 3456789', '+60 12-345 6789', '60123456789']) {
      expect(normalizeMalaysianPhone(written)).toBe('012-3456789')
    }
  })

  it('keeps the three-digit prefix on mobiles and two on landlines', () => {
    expect(normalizeMalaysianPhone('01112345678')).toBe('011-12345678')
    expect(normalizeMalaysianPhone('0312345678')).toBe('03-12345678')
    expect(normalizeMalaysianPhone('054567890')).toBe('05-4567890')
  })

  it('hands back anything that is not a phone number untouched', () => {
    // An IC number and an order reference both turn up in these conversations.
    // Reformatting one into something phone-shaped is worse than leaving it
    // for the person who is about to read the field.
    expect(normalizeMalaysianPhone('880101-14-5566')).toBe('880101-14-5566')
    expect(normalizeMalaysianPhone('123')).toBe('123')
  })

  it('treats absence, blankness and the word "null" the same', () => {
    expect(normalizeMalaysianPhone(null)).toBeNull()
    expect(normalizeMalaysianPhone('   ')).toBeNull()
    expect(normalizeMalaysianPhone('N/A')).toBeNull()
    expect(normalizeMalaysianPhone(undefined)).toBeNull()
  })
})

describe('normalizeExtractedDealer', () => {
  it('snaps a region onto the canonical spelling the rest of the app groups by', () => {
    expect(normalizeExtractedDealer({ region: 'ipoh' }).region).toBe('Ipoh')
    expect(normalizeExtractedDealer({ region: ' PENANG ' }).region).toBe('Penang')
  })

  it('leaves a town that is not on the list alone rather than dropping it', () => {
    expect(normalizeExtractedDealer({ region: 'Alor Setar' }).region).toBe('Alor Setar')
  })

  it('drops a WhatsApp number that is the same as the phone number', () => {
    // The field means "a different number from the one above" — its own
    // placeholder reads "Same as phone". Filling both with one number turns a
    // blank that means something into noise.
    const d = normalizeExtractedDealer({ phone: '012-3456789', whatsapp: '+60123456789' })
    expect(d.phone).toBe('012-3456789')
    expect(d.whatsapp).toBeNull()
  })

  it('keeps a WhatsApp number that genuinely differs', () => {
    const d = normalizeExtractedDealer({ phone: '012-3456789', whatsapp: '019-8887777' })
    expect(d.whatsapp).toBe('019-8887777')
  })

  it('refuses an email the form field could never accept', () => {
    // The input is type="email"; handing it "ask me later" blocks the save
    // with no clue where the value came from.
    expect(normalizeExtractedDealer({ email: 'ask me later' }).email).toBeNull()
    expect(normalizeExtractedDealer({ email: ' Boss@Shop.COM ' }).email).toBe('boss@shop.com')
  })

  it('collapses the whitespace a screenshot read leaves behind', () => {
    expect(normalizeExtractedDealer({ company_name: '  Ipoh   Trading \n' }).company_name).toBe('Ipoh Trading')
  })

  it('upper-cases the SSM suffix', () => {
    expect(normalizeExtractedDealer({ company_no: '202301234567-x' }).company_no).toBe('202301234567-X')
  })

  it('reads a model that answered in words instead of nulls as empty', () => {
    const d = normalizeExtractedDealer({ company_name: 'unknown', address: 'not stated', email: 'none' })
    expect(d.company_name).toBeNull()
    expect(d.address).toBeNull()
    expect(d.email).toBeNull()
  })

  it('survives a response missing every key', () => {
    expect(isEmptyExtraction(normalizeExtractedDealer({}))).toBe(true)
    expect(isEmptyExtraction(normalizeExtractedDealer(null))).toBe(true)
  })

  it('is not empty when even one field came back', () => {
    expect(isEmptyExtraction(normalizeExtractedDealer({ company_name: 'Ipoh Trading' }))).toBe(false)
  })
})

describe('DEALER_EXTRACTION_SCHEMA', () => {
  it('never asks the model for a package or a rate', () => {
    // The rate a dealer gets is a commercial decision. A model that is not
    // given the field cannot invent one out of a chat log.
    const properties = Object.keys(DEALER_EXTRACTION_SCHEMA.properties)
    expect(properties).not.toContain('package')
    expect(properties).not.toContain('rate')
  })

  it('allows null for every field it does ask for', () => {
    for (const [name, spec] of Object.entries(DEALER_EXTRACTION_SCHEMA.properties)) {
      expect(spec.type, `${name} must be allowed to come back empty`).toContain('null')
    }
  })

  it('requires every property, so a partial answer is a schema error not a silent gap', () => {
    expect([...DEALER_EXTRACTION_SCHEMA.required].sort()).toEqual(Object.keys(DEALER_EXTRACTION_SCHEMA.properties).sort())
  })
})
