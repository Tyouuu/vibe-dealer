import { describe, it, expect } from 'vitest'
import { avatarInitials, avatarHex } from './avatar'

describe('avatarInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(avatarInitials('Jaya Telecom Sdn Bhd')).toBe('JT')
  })

  it('uses one letter when there is only one word', () => {
    expect(avatarInitials('Quickturn')).toBe('Q')
  })

  // The two real dealer names that were rendering punctuation in their avatar.
  it('skips words that do not start with a letter or digit', () => {
    expect(avatarInitials('CK & WYNN GADGET')).toBe('CW')
    expect(avatarInitials('EXCLUSIVE - STATION 18')).toBe('ES')
  })

  it('handles a parenthesised suffix', () => {
    expect(avatarInitials('CS (test)')).toBe('CT')
  })

  it('keeps digits, which are legitimate initials here', () => {
    expect(avatarInitials('188 Mobile Venture')).toBe('1M')
  })

  it('falls back rather than rendering an empty square', () => {
    expect(avatarInitials('')).toBe('?')
    expect(avatarInitials('--- ///')).toBe('?')
  })

  it('uppercases', () => {
    expect(avatarInitials('fone corner enterprise')).toBe('FC')
  })
})

describe('avatarHex', () => {
  it('is deterministic for the same name', () => {
    expect(avatarHex('Ipoh Demo')).toBe(avatarHex('Ipoh Demo'))
  })

  it('always returns a colour from the palette', () => {
    for (const name of ['a', 'Jaya Telecom', 'CK & WYNN GADGET', '']) {
      expect(avatarHex(name)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
