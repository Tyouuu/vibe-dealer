import { describe, expect, it } from 'vitest'
import { friendlyDbError } from './db-error'

describe('friendlyDbError', () => {
  it('turns the credit-balance trigger into the same sentence the app-layer check uses', () => {
    const raw = 'insufficient_credit_balance: 21501 pts available, 30000 pts requested'
    expect(friendlyDbError(raw)).toBe(
      'Not enough credit balance: 21,501 pts available, this needs 30,000 pts. Log a Credit Purchase first.'
    )
  })

  it('never lets the raw trigger text through', () => {
    expect(friendlyDbError('insufficient_credit_balance: 1 pts available, 2 pts requested')).not.toContain(
      'insufficient_credit_balance'
    )
  })

  it('rewrites the SIM stock prefix', () => {
    expect(friendlyDbError('insufficient_sim_stock: 4 available, 10 requested')).toBe(
      'Not enough stock — 4 available, 10 requested'
    )
  })

  it('names a duplicate dealer, which is the one unique violation an operator can act on', () => {
    const raw = 'duplicate key value violates unique constraint "dealers_company_name_key"'
    expect(friendlyDbError(raw)).toBe('A dealer with that name already exists.')
  })

  it('translates an RLS refusal without naming the policy', () => {
    const out = friendlyDbError('new row violates row-level security policy for table "transactions"')
    expect(out).toBe('You do not have permission to do that.')
    expect(out).not.toContain('row-level security')
  })

  it('handles a bad date', () => {
    expect(friendlyDbError('invalid input syntax for type date: "not-a-date"')).toBe(
      'That date could not be read. Please pick it again.'
    )
  })

  it('falls back to a generic line for anything unrecognised, leaking no column or constraint names', () => {
    const raw = 'null value in column "secret_internal_col" of relation "transactions" violates not-null constraint'
    const out = friendlyDbError(raw)
    expect(out).toBe('Something went wrong saving that. Nothing was changed — please try again.')
    expect(out).not.toContain('secret_internal_col')
  })

  it('survives null and undefined', () => {
    expect(friendlyDbError(null)).toContain('Something went wrong')
    expect(friendlyDbError(undefined)).toContain('Something went wrong')
  })
})
