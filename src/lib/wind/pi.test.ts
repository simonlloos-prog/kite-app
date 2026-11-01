import { describe, expect, it } from 'vitest'
import type { Grid } from './arome'
import { decodePi, gustTrend } from './pi'

const grid: Grid = { south: 44, west: -2, step: 0.01, rows: 2, cols: 3 }

describe('AROME-PI', () => {
  it('decodes one gust grid per hour, 255 = missing', () => {
    const bytes = Uint8Array.from([10, 20, 30, 40, 50, 255, 1, 2, 3, 4, 5, 6])
    const [h1, h2] = decodePi(bytes.buffer, grid, 2, 0.5)
    expect(Array.from(h1.slice(0, 5))).toEqual([5, 10, 15, 20, 25])
    expect(h1[5]).toBeNaN()
    expect(h2[5]).toBe(3)
    expect(() => decodePi(bytes.buffer, grid, 3, 0.5)).toThrow()
  })

  it('says whether the fresher run expects stronger or weaker gusts', () => {
    expect(gustTrend([[20, 23], [18, 21]])).toEqual({ delta: 3, trend: 'up' })
    expect(gustTrend([[20, 17], [20, 18]])).toEqual({ delta: -2.5, trend: 'down' })
    expect(gustTrend([[20, 21], [20, 19.5]])?.trend).toBe('flat')
  })

  it('only compares hours both runs cover', () => {
    expect(gustTrend([[NaN, 30], [20, 22]])).toEqual({ delta: 2, trend: 'up' })
    expect(gustTrend([[NaN, 30]])).toBeNull()
    expect(gustTrend([])).toBeNull()
  })
})
