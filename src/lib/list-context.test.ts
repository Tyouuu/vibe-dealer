import { describe, expect, it } from 'vitest'
import { safeListPath } from './list-context'

describe('safeListPath', () => {
  it('keeps the list address with its search, region, view and page', () => {
    expect(safeListPath('/dealers?q=wei&region=Selangor&page=3')).toBe('/dealers?q=wei&region=Selangor&page=3')
    expect(safeListPath('/dealers')).toBe('/dealers')
  })
  it('falls back to the plain list for anything else', () => {
    expect(safeListPath(undefined)).toBe('/dealers')
    expect(safeListPath('')).toBe('/dealers')
    expect(safeListPath('https://evil.example/dealers')).toBe('/dealers')
    expect(safeListPath('//evil.example')).toBe('/dealers')
    expect(safeListPath('/records?q=x')).toBe('/dealers')
    expect(safeListPath('/dealersfoo')).toBe('/dealers')
  })
})
