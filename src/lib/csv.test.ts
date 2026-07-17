import { describe, expect, it } from 'vitest'
import { csvCell } from './csv'

describe('csvCell', () => {
  it('passes plain text through unchanged', () => {
    expect(csvCell('Acme Sdn Bhd')).toBe('Acme Sdn Bhd')
  })

  it('turns null into an empty cell', () => {
    expect(csvCell(null)).toBe('')
  })

  it('stringifies numbers', () => {
    expect(csvCell(1234.5)).toBe('1234.5')
  })

  it.each(['=cmd', '+1', '-1', '@SUM(A1)', '\tvalue', '\rvalue'])(
    'neutralizes formula-injection prefix in %j by prepending a quote',
    (dangerous) => {
      const result = csvCell(dangerous)
      expect(result.startsWith("'")).toBe(true)
    }
  )

  it('quotes and escapes a value containing a comma', () => {
    expect(csvCell('Ipoh, Perak')).toBe('"Ipoh, Perak"')
  })

  it('quotes and doubles internal quotes', () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""')
  })

  it('quotes a value containing a newline', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})
