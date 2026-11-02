import { describe, expect, it } from 'vitest'
import { highWaters, tideByTime, tideLabel } from './tide'

/** A 12 h tide, ±1 m, high water at hour 3. */
const times = Array.from({ length: 30 }, (_, i) => `h${i}`)
const heights = times.map((_, i) => Math.round(Math.cos(((i - 3) / 12) * 2 * Math.PI) * 100) / 100)

describe('tide', () => {
  const tide = tideByTime({ times, heights })

  it('places each hour between low and high water', () => {
    expect(tide.get('h9')).toMatchObject({ level: 0, rising: false })
    expect(tide.get('h15')).toMatchObject({ level: 1, rising: false })
    expect(tide.get('h12')!.level).toBeCloseTo(0.5)
    expect(tide.get('h12')!.rising).toBe(true)
  })

  it('counts the hours from the nearest high water', () => {
    expect(highWaters(heights)).toEqual([3, 15, 27])
    expect(highWaters([0, 1, 1, 0])[0]).toBeCloseTo(1.5)
    expect(tide.get('h13')!.fromHigh).toBe(-2)
    expect(tide.get('h17')!.fromHigh).toBe(2)
    expect(tide.get('h9')!.fromHigh).toBe(6)
  })

  it('leaves out the hours without a full cycle around them', () => {
    expect(tide.has('h5')).toBe(false)
    expect(tide.has('h6')).toBe(true)
    expect(tide.has('h23')).toBe(true)
    expect(tide.has('h24')).toBe(false)
  })

  it('names the tide', () => {
    expect(tideLabel({ level: 0.1, rising: true, fromHigh: 5 })).toBe('marée basse ↑')
    expect(tideLabel({ level: 0.5, rising: false, fromHigh: 3 })).toBe('mi-marée ↓')
    expect(tideLabel({ level: 0.9, rising: true, fromHigh: -1 })).toBe('marée haute ↑')
  })
})
