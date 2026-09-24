import { describe, expect, it } from 'vitest'
import { clampPage, pageWindow } from './pagination'

describe('pageWindow', () => {
  it('shows every page when there are only a few', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4])
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('elides the far pages but keeps first, last and neighbours', () => {
    expect(pageWindow(1, 8)).toEqual([1, 2, 'gap', 8])
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 'gap', 8])
    expect(pageWindow(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20])
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20])
  })

  it('fills a one-page gap instead of drawing an ellipsis for it', () => {
    expect(pageWindow(4, 9)).toEqual([1, 2, 3, 4, 5, 'gap', 9])
    expect(pageWindow(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9])
    expect(pageWindow(3, 9)).toEqual([1, 2, 3, 4, 'gap', 9])
    expect(pageWindow(1, 8)).toEqual([1, 2, 'gap', 8])
  })
})

describe('clampPage', () => {
  it('lands typos and out-of-range values on a real page', () => {
    expect(clampPage(undefined, 8)).toBe(1)
    expect(clampPage('abc', 8)).toBe(1)
    expect(clampPage('0', 8)).toBe(1)
    expect(clampPage('-3', 8)).toBe(1)
    expect(clampPage('3.9', 8)).toBe(3)
    expect(clampPage('9999', 8)).toBe(8)
    expect(clampPage('5', 8)).toBe(5)
  })
})
