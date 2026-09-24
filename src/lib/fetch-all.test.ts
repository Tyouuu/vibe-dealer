import { describe, expect, it } from 'vitest'
import { allRows, fetchAll, API_PAGE_SIZE } from './fetch-all'

// A stand-in table that, like the real API, never returns more than 1,000 rows per request.
function table(total: number) {
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const n = Math.max(0, Math.min(to, total - 1) - from + 1)
    return { data: Array.from({ length: n }, (_, i) => ({ n: from + i })), error: null }
  }
  return { page, calls }
}

describe('fetchAll', () => {
  it('returns every row across pages, in order, with no duplicates', async () => {
    const t = table(12_237)
    const rows = await fetchAll(t.page)
    expect(rows).toHaveLength(12_237)
    expect(rows.every((r, i) => r.n === i)).toBe(true)
  })

  it('costs one request for a table that fits in a page', async () => {
    const small = table(37)
    expect(await fetchAll(small.page)).toHaveLength(37)
    expect(small.calls).toEqual([[0, 999]])
    const empty = table(0)
    expect(await fetchAll(empty.page)).toEqual([])
    expect(empty.calls).toHaveLength(1)
  })

  it('does not lose or repeat rows at an exact multiple of the page size', async () => {
    for (const total of [1000, 2000, 5000, 5001]) {
      const rows = await fetchAll(table(total).page)
      expect(rows, String(total)).toHaveLength(total)
      expect(rows.every((r, i) => r.n === i)).toBe(true)
    }
  })

  it('asks for the later pages a few at a time, not one by one', async () => {
    const t = table(9500)
    await fetchAll(t.page)
    expect(t.calls[0]).toEqual([0, 999])
    expect(t.calls.slice(1, 5).map((c) => c[0])).toEqual([1000, 2000, 3000, 4000])
  })

  it('throws on an error instead of returning a short list that looks complete', async () => {
    let n = 0
    const failing = async () => (++n === 3 ? { data: null, error: { message: 'boom' } } : { data: Array.from({ length: API_PAGE_SIZE }, () => ({})), error: null })
    await expect(fetchAll(failing)).rejects.toThrow('boom')
  })

  it('refuses to read an unreasonable number of rows', async () => {
    const endless = async () => ({ data: Array.from({ length: API_PAGE_SIZE }, () => ({})), error: null })
    await expect(fetchAll(endless)).rejects.toThrow('aggregate this in SQL')
  })
})

describe('allRows', () => {
  it('wraps the rows the way a query resolves, so a page can swap it in', async () => {
    const { data } = await allRows(table(2500).page)
    expect(data).toHaveLength(2500)
  })
})
