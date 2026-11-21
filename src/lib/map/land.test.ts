import { describe, expect, it } from 'vitest'
import { isLand, onRaster, rasterize, seaPieces } from './land'

describe('land raster', () => {
  it('fills polygons by scanlines, holes left out', () => {
    const square = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b], [a, a]]
    const m = rasterize([[square(0, 10), square(4, 6)]], 1)
    expect(onRaster(m, 2.5, 2.5)).toBe(true)
    expect(onRaster(m, 5.5, 5.5)).toBe(false)
    expect(onRaster(m, 11, 5)).toBe(false)
  })

  it('knows the coast: the Landes forest is land, the sea off Le Porge is not', () => {
    expect(isLand(-1.1, 44.85)).toBe(true)
    expect(isLand(-1.3, 44.85)).toBe(false)
    // Lacanau lake: land for the mask (drawn grey on top).
    expect(isLand(-1.11, 44.97)).toBe(true)
  })

  it('cuts a line where it goes ashore', () => {
    const line: [number, number][] = [[-1.4, 44.85], [-1.35, 44.85], [-1.1, 44.85], [-1.05, 44.85]]
    const pieces = seaPieces(line)
    expect(pieces).toHaveLength(1)
    expect(pieces[0].slice(0, 2)).toEqual([[-1.4, 44.85], [-1.35, 44.85]])
    // Ends on the coast (Le Porge beach, ~1.225° W), not at the last point at sea.
    const end = pieces[0][2][0]
    expect(end).toBeGreaterThan(-1.24)
    expect(end).toBeLessThan(-1.21)
    expect(isLand(end, 44.85)).toBe(false)
  })
})
