import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHECKS, CHECK_KEYS, interpret, problemLines, verdictOf, type RawCheckRow } from './system-check'
import { CREDIT_PURCHASE_RATE, PACKAGES } from './packages'

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '0058_system_checks.sql'), 'utf8')

// One row per check, every one healthy.
function healthy(overrides: Partial<Record<string, Partial<RawCheckRow>>> = {}): RawCheckRow[] {
  return CHECK_KEYS.map((key) => ({ check_key: key, checked: 100, problems: 0, samples: [], ...overrides[key] }))
}

describe('the database function and this file describe the same checks', () => {
  const inSql = [...sql.matchAll(/^\s*'([a-z_]+)'::text,\s*$/gm)].map((m) => m[1])

  it('every check in the SQL has wording, and every wording has a check', () => {
    expect([...inSql].sort()).toEqual([...CHECK_KEYS].sort())
  })

  it('has no check twice', () => {
    expect(new Set(inSql).size).toBe(inSql.length)
  })

  // The price list and the rates are repeated in SQL because the database has to check them, and
  // repeated constants drift. If a price changes in packages.ts and not in the migration, every new
  // package sale would be reported as wrong.
  it('the SQL price list is the one in packages.ts', () => {
    const points = sql.match(/case t\.package when 'A' then (\d+) when 'B' then (\d+) when 'C' then (\d+) end\) \* t\.quantity as exp_pts/)
    const money = sql.match(/case t\.package when 'A' then (\d+) when 'B' then (\d+) when 'C' then (\d+) end\) \* t\.quantity as exp_rm/)
    expect(points?.slice(1).map(Number)).toEqual([PACKAGES.A.reload, PACKAGES.B.reload, PACKAGES.C.reload])
    expect(money?.slice(1).map(Number)).toEqual([PACKAGES.A.price, PACKAGES.B.price, PACKAGES.C.price])
  })

  it('the SQL purchase rate is the one in packages.ts', () => {
    const divisor = sql.match(/p\.money_rm \/ (0\.\d+)/)
    expect(Number(divisor?.[1])).toBeCloseTo(1 - CREDIT_PURCHASE_RATE, 10)
  })
})

describe('interpret', () => {
  it('a healthy run has no failures and no warnings', () => {
    const run = interpret(healthy())
    expect(run.failCount).toBe(0)
    expect(run.warnCount).toBe(0)
    expect(run.results.every((r) => r.status === 'ok')).toBe(true)
    expect(verdictOf(run)).toBe('clear')
  })

  it('reports checks in the order they are defined, most serious first', () => {
    expect(interpret(healthy()).results.map((r) => r.key)).toEqual(CHECK_KEYS)
    expect(CHECK_KEYS[0]).toBe('balance_agrees')
  })

  it('a problem takes the severity of its check', () => {
    const run = interpret(healthy({ signed_off: { problems: 3 }, topup_maths: { problems: 2 }, paper_trail: { problems: 90 } }))
    const status = Object.fromEntries(run.results.map((r) => [r.key, r.status]))
    expect(status.signed_off).toBe('fail')
    expect(status.topup_maths).toBe('warn')
    // Receipts are a figure, not a fault: they show, they do not alarm.
    expect(status.paper_trail).toBe('info')
    expect(run.failCount).toBe(1)
    expect(run.warnCount).toBe(1)
    expect(verdictOf(run)).toBe('problem')
  })

  it('a warning alone is "worth a look", not a problem', () => {
    expect(verdictOf(interpret(healthy({ possible_duplicates: { problems: 1 } })))).toBe('look')
  })

  it('a check the database did not return FAILS rather than passing', () => {
    // The one property that makes a green page mean something: silence is not a pass.
    const rows = healthy().filter((r) => r.check_key !== 'closed_months_hold')
    const run = interpret(rows)
    const missing = run.results.find((r) => r.key === 'closed_months_hold')!
    expect(missing.status).toBe('fail')
    expect(missing.didNotRun).toBe(true)
    expect(run.failCount).toBe(1)
  })

  it('a database with no checks at all is fifteen failures, not a clean bill of health', () => {
    const run = interpret([])
    expect(run.failCount).toBe(CHECK_KEYS.length)
    expect(verdictOf(run)).toBe('problem')
  })

  it('a check this file has never heard of is still shown, and still counts if it found something', () => {
    const run = interpret([...healthy(), { check_key: 'brand_new_rule', checked: 5, problems: 2, samples: [] }])
    const extra = run.results.find((r) => r.key === 'brand_new_rule')!
    expect(extra.status).toBe('fail')
    expect(run.failCount).toBe(1)
  })

  it('carries the examples through', () => {
    const sample = { id: 'abc', dealer_id: 'def', label: 'Ali Store · 03 Sep 2026', detail: 'RM 940.00 recorded as 1,200 pts' }
    const run = interpret(healthy({ topup_maths: { problems: 1, samples: [sample] } }))
    expect(run.results.find((r) => r.key === 'topup_maths')!.samples).toEqual([sample])
  })

  it('tolerates a null samples column', () => {
    const run = interpret(healthy({ topup_maths: { samples: null } }))
    expect(run.results.find((r) => r.key === 'topup_maths')!.samples).toEqual([])
  })
})

describe('wording', () => {
  it('says something sensible on a system nobody has started', () => {
    const run = interpret(CHECK_KEYS.map((key) => ({ check_key: key, checked: 0, problems: 0, samples: [] })))
    for (const r of run.results) {
      expect(r.line.length).toBeGreaterThan(0)
      // "All 0 entries look possible" is the sentence this exists to prevent.
      expect(r.line).not.toMatch(/\b0 (entries|top-ups|purchases|sales|corrections)\b/)
    }
  })

  it('counts are singular and plural correctly', () => {
    const one = interpret(healthy({ signed_off: { problems: 1 } })).results.find((r) => r.key === 'signed_off')!
    const many = interpret(healthy({ signed_off: { problems: 4 } })).results.find((r) => r.key === 'signed_off')!
    expect(one.line).toBe('1 verified entry has nobody recorded against them')
    expect(many.line).toBe('4 verified entries have nobody recorded against them')
  })

  it('receipts read as a coverage figure', () => {
    const line = interpret(healthy({ paper_trail: { checked: 218, problems: 217 } })).results.find((r) => r.key === 'paper_trail')!.line
    expect(line).toBe('1 of 218 have a receipt attached — 217 do not')
  })

  it('every check explains why it matters', () => {
    for (const key of CHECK_KEYS) expect(CHECKS[key].why.length).toBeGreaterThan(30)
  })
})

describe('problemLines', () => {
  it('lists failures only, without naming dealers', () => {
    const sample = { id: null, dealer_id: 'x', label: 'Ali Store · 03 Sep 2026', detail: 'd' }
    const run = interpret(healthy({ signed_off: { problems: 2, samples: [sample] }, topup_maths: { problems: 1 } }))
    const lines = problemLines(run)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Every verified entry has a name against it')
    expect(lines.join(' ')).not.toContain('Ali Store')
  })
})

// The closed-month check finds the last close by the note the close action writes (0058, check 11). If
// that wording ever changes in the action and not in the SQL, every month would look as though it had
// never been closed over a gap, and the check would quietly compare against the wrong standard.
describe('the closed-month check reads the notes the reconcile action writes', () => {
  const action = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(app)', 'reconcile', 'actions.ts'), 'utf8')

  it('the SQL looks for the note the action writes when a month is closed', () => {
    expect(sql).toContain("r.note like 'Reconciliation marked complete%'")
    expect(action).toContain("'Reconciliation marked complete'")
    expect(action).toContain('`Reconciliation marked complete despite')
  })
})
