import { describe, expect, it } from 'vitest'
import { cleanStreak, dailyStates, malaysiaDate } from './system-check-history'

const run = (ran_at: string, fail_count = 0, warn_count = 0) => ({ ran_at, fail_count, warn_count })

describe('malaysiaDate', () => {
  it('is the Malaysian calendar day, not the UTC one', () => {
    // 17:00 UTC on the 24th is 01:00 on the 25th in Kuala Lumpur.
    expect(malaysiaDate('2026-09-24T17:00:00Z')).toBe('2026-09-25')
    expect(malaysiaDate('2026-09-24T15:59:00Z')).toBe('2026-09-24')
  })
})

describe('dailyStates', () => {
  it('gives one entry per day ending today, oldest first', () => {
    const days = dailyStates([], '2026-09-25', 5)
    expect(days.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'])
    expect(days.every((d) => d.state === 'none')).toBe(true)
  })

  it('a day with no run is unknown, never clear', () => {
    const days = dailyStates([run('2026-09-24T01:00:00Z')], '2026-09-25', 3)
    expect(days.map((d) => d.state)).toEqual(['none', 'clear', 'none'])
  })

  it('colours a day by the worst thing found that day, not the last run', () => {
    const days = dailyStates(
      [run('2026-09-24T01:00:00Z', 2), run('2026-09-24T07:30:00Z', 0)],
      '2026-09-24',
      1,
    )
    expect(days[0].state).toBe('problem')
  })

  it('a warning is "look", and a failure outranks it', () => {
    expect(dailyStates([run('2026-09-24T01:00:00Z', 0, 3)], '2026-09-24', 1)[0].state).toBe('look')
    expect(dailyStates([run('2026-09-24T01:00:00Z', 1, 3)], '2026-09-24', 1)[0].state).toBe('problem')
  })

  it('files a run under its Malaysian day', () => {
    // 20:00 UTC on the 23rd is 04:00 on the 24th in Malaysia.
    const days = dailyStates([run('2026-09-23T20:00:00Z', 1)], '2026-09-24', 2)
    expect(days.map((d) => d.state)).toEqual(['none', 'problem'])
  })

  it('ignores runs older than the window', () => {
    expect(dailyStates([run('2026-01-01T01:00:00Z', 1)], '2026-09-25', 3).every((d) => d.state === 'none')).toBe(true)
  })
})

describe('cleanStreak', () => {
  const d = (...states: ('clear' | 'look' | 'problem' | 'none')[]) => states.map((state) => ({ state }))

  it('counts days in a row with no broken rule', () => {
    expect(cleanStreak(d('clear', 'clear', 'clear'))).toBe(3)
  })

  it('a warning does not end it', () => {
    expect(cleanStreak(d('clear', 'look', 'clear'))).toBe(3)
  })

  it('a broken rule ends it, and only the days after count', () => {
    expect(cleanStreak(d('clear', 'problem', 'clear', 'clear'))).toBe(2)
  })

  it('a day nobody checked ends it', () => {
    expect(cleanStreak(d('clear', 'none', 'clear'))).toBe(1)
  })

  it('today not having run yet does not end it', () => {
    // The morning run has not happened at 08:00.
    expect(cleanStreak(d('clear', 'clear', 'none'))).toBe(2)
  })

  it('a system that has never run has no streak', () => {
    expect(cleanStreak(d('none', 'none', 'none'))).toBe(0)
  })

  it('a broken rule today is no streak', () => {
    expect(cleanStreak(d('clear', 'clear', 'problem'))).toBe(0)
  })
})
