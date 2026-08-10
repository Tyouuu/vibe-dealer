import { describe, expect, it } from 'vitest'
import {
  PACKAGE_SIM_CARDS,
  SIM_MARGIN_RM,
  cardEarningsRm,
  cardsOwedByDealer,
  packageCardEconomics,
} from './sim-stock'

describe('cardEarningsRm', () => {
  it('is RM1.50 a card — the figure the dealers list now shows per dealer', () => {
    expect(cardEarningsRm(20)).toBe(30)
    expect(cardEarningsRm(40)).toBe(60)
    expect(cardEarningsRm(100)).toBe(150)
  })

  it('is zero for a dealer who has bought no package', () => {
    expect(cardEarningsRm(0)).toBe(0)
  })

  it('holds the whole Northern event: 10,480 cards is RM15,720', () => {
    // The corrected total. An earlier figure of 11,480 / RM17,220 counted an
    // unattributable RM12,700 row as ten Package Cs — see the note in
    // sim-stock.ts. This is the number the business should recognise.
    expect(cardEarningsRm(10_480)).toBe(15_720)
  })

  it('stays exact on a count that would give floating-point dust', () => {
    // 0.1 + 0.2 arithmetic reaches this table through nothing today, since
    // every price is a clean multiple of 0.5 — but a figure someone
    // reconciles against a bank statement should not start drifting the day
    // one of them stops being.
    expect(cardEarningsRm(3)).toBe(4.5)
    expect(cardEarningsRm(7)).toBe(10.5)
    expect(Number.isInteger(cardEarningsRm(1234) * 100)).toBe(true)
  })
})

describe('packageCardEconomics', () => {
  it('gives the three figures the owner quoted for one of each package', () => {
    // Stated by the business on 2026-08-10: A is 20 cards for RM30, B is 40
    // for RM60, C is 100 for RM150. If this test fails, either the card counts
    // or the RM1.50 margin has moved, and both are commercial facts that
    // should not move quietly.
    expect(packageCardEconomics('A')).toMatchObject({ cards: 20, marginRm: 30 })
    expect(packageCardEconomics('B')).toMatchObject({ cards: 40, marginRm: 60 })
    expect(packageCardEconomics('C')).toMatchObject({ cards: 100, marginRm: 150 })
  })

  it('is the card count times the standing margin, for every package', () => {
    for (const [pkg, cards] of Object.entries(PACKAGE_SIM_CARDS)) {
      expect(packageCardEconomics(pkg as 'A' | 'B' | 'C').marginRm).toBe(cards * SIM_MARGIN_RM)
    }
  })

  it('scales with quantity, because one dealer bought forty at once', () => {
    // YEE SEN MARKETING, 2026-07-28: 40 x Package C.
    const e = packageCardEconomics('C', 40)
    expect(e.cards).toBe(4000)
    expect(e.revenueRm).toBe(14000)
    expect(e.costRm).toBe(8000)
    expect(e.marginRm).toBe(6000)
  })

  it('adds up to the launch event total', () => {
    // Northern launch event, 27-28 July 2026: 16 x A, 4 x B, 110 x C.
    const total = packageCardEconomics('A', 16).cards + packageCardEconomics('B', 4).cards + packageCardEconomics('C', 110).cards
    expect(total).toBe(11480)
    const margin =
      packageCardEconomics('A', 16).marginRm + packageCardEconomics('B', 4).marginRm + packageCardEconomics('C', 110).marginRm
    expect(margin).toBe(17220)
  })

  it('keeps revenue, cost and margin consistent', () => {
    const e = packageCardEconomics('C', 7)
    expect(e.revenueRm - e.costRm).toBe(e.marginRm)
  })
})

describe('cardsOwedByDealer', () => {
  it('reports a dealer who took only part of what they bought', () => {
    // SK LINE ENTERPRISE at the launch event: bought 1 x Package C, and the
    // sheet notes "Took 10 pcs numbered SIM".
    const { byDealer, totalOwed } = cardsOwedByDealer(
      [{ dealer_id: 'sk', package: 'C' }],
      [{ dealer_id: 'sk', quantity: 10 }]
    )
    expect(byDealer.get('sk')).toEqual({ entitled: 100, delivered: 10, owed: 90 })
    expect(totalOwed).toBe(90)
  })

  it('owes nothing once the cards have all gone out', () => {
    const { byDealer, totalOwed } = cardsOwedByDealer(
      [{ dealer_id: 'a', package: 'A' }],
      [{ dealer_id: 'a', quantity: 20 }]
    )
    expect(byDealer.get('a')?.owed).toBe(0)
    expect(totalOwed).toBe(0)
  })

  it('never lets one dealer buying extra cards hide another dealer being short', () => {
    // A dealer can buy loose cards on top of a package. Netting that surplus
    // against someone else's shortfall would make the owed figure quietly
    // wrong in the one direction that matters.
    const { totalOwed, totalDelivered } = cardsOwedByDealer(
      [
        { dealer_id: 'short', package: 'C' },
        { dealer_id: 'extra', package: 'A' },
      ],
      [
        { dealer_id: 'short', quantity: 10 },
        { dealer_id: 'extra', quantity: 500 },
      ]
    )
    expect(totalOwed).toBe(90)
    expect(totalDelivered).toBe(510)
  })

  it('counts several packages bought by the same dealer', () => {
    // ONE EIGHT EIGHT MOBILE VENTURE placed five separate orders that weekend.
    const { byDealer } = cardsOwedByDealer(
      [
        { dealer_id: 'd', package: 'A' },
        { dealer_id: 'd', package: 'C' },
        { dealer_id: 'd', package: 'C' },
      ],
      []
    )
    expect(byDealer.get('d')?.entitled).toBe(220)
  })

  it('ignores rows that are not package sales', () => {
    const { totalEntitled } = cardsOwedByDealer(
      [
        { dealer_id: 'd', package: null },
        { dealer_id: 'd', package: 'Z' },
      ],
      []
    )
    expect(totalEntitled).toBe(0)
  })

  it('still lists a dealer who has cards but no package', () => {
    const { byDealer, totalOwed } = cardsOwedByDealer([], [{ dealer_id: 'loose', quantity: 50 }])
    expect(byDealer.get('loose')).toEqual({ entitled: 0, delivered: 50, owed: 0 })
    expect(totalOwed).toBe(0)
  })

  it('handles nothing at all', () => {
    const r = cardsOwedByDealer([], [])
    expect(r.totalEntitled).toBe(0)
    expect(r.totalOwed).toBe(0)
    expect(r.byDealer.size).toBe(0)
  })
})
