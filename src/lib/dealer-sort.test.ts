import { describe, expect, it } from 'vitest'
import { compareDealers, nextDealerSort, parseDealerSort } from './dealer-sort'

const d = (company_name: string, region: string | null, pkg: string | null, totalPoints: number, cardEarningsRm: number) => ({
  company_name, region, package: pkg, totalPoints, cardEarningsRm,
})
const rows = [d('Bravo', 'Ipoh', 'B', 500, 30), d('Alpha', null, null, 900, 0), d('Charlie', 'Ayer Itam', 'A', 100, 60)]
const sorted = (key: Parameters<typeof compareDealers>[2]['key'], dir: 'asc' | 'desc') =>
  [...rows].sort((a, b) => compareDealers(a, b, { key, dir })).map((r) => r.company_name)

describe('parseDealerSort', () => {
  it('ignores anything that is not a sortable column', () => {
    expect(parseDealerSort(undefined, undefined)).toBeNull()
    expect(parseDealerSort('rate', 'asc')).toBeNull()
  })
  it('defaults to the natural direction for the column', () => {
    expect(parseDealerSort('name', undefined)).toEqual({ key: 'name', dir: 'asc' })
    expect(parseDealerSort('topup', undefined)).toEqual({ key: 'topup', dir: 'desc' })
    expect(parseDealerSort('topup', 'asc')).toEqual({ key: 'topup', dir: 'asc' })
    expect(parseDealerSort('topup', 'sideways')).toEqual({ key: 'topup', dir: 'desc' })
  })
})

describe('nextDealerSort', () => {
  it('goes sort, reverse, then back to the default order', () => {
    const first = nextDealerSort(null, 'name')
    expect(first).toEqual({ key: 'name', dir: 'asc' })
    const second = nextDealerSort(first, 'name')
    expect(second).toEqual({ key: 'name', dir: 'desc' })
    expect(nextDealerSort(second, 'name')).toBeNull()
  })
  it('starts a different column from its own natural direction', () => {
    expect(nextDealerSort({ key: 'name', dir: 'desc' }, 'topup')).toEqual({ key: 'topup', dir: 'desc' })
  })
})

describe('compareDealers', () => {
  it('sorts names and volumes in both directions', () => {
    expect(sorted('name', 'asc')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(sorted('name', 'desc')).toEqual(['Charlie', 'Bravo', 'Alpha'])
    expect(sorted('topup', 'desc')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(sorted('cards', 'asc')).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
  it('puts a missing region or package last whichever way it sorts', () => {
    expect(sorted('region', 'asc')).toEqual(['Charlie', 'Bravo', 'Alpha'])
    expect(sorted('region', 'desc')).toEqual(['Bravo', 'Charlie', 'Alpha'])
    expect(sorted('package', 'asc')).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })
})
