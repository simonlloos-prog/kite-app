import { describe, expect, it } from 'vitest'
import { isLand } from '../map/land'
import { crestRows, rowGap, oceanCoast, surfArcs, waveColor } from './surf'

// Le Porge – Le Grand Crohot, zoom 10.5.
const bounds = { south: 44.78, north: 44.92, west: -1.4, east: -1.0 }
const arcs = (hs: number, tp: number, dir: number) => surfArcs(oceanCoast(), () => ({ hs, tp, dir }), 10.5, bounds)

describe('surf crests (Mix)', () => {
  it('finds the ocean coast from the Pointe de Grave to the south', () => {
    const coast = oceanCoast()
    expect(coast[0].lat).toBeCloseTo(43.56)
    expect(coast[coast.length - 1].lat).toBeGreaterThan(45.5)
    // At Le Porge, the beach is ~1.225° W.
    const porge = coast.find((p) => Math.abs(p.lat - 44.85) < 0.002)!
    expect(porge.lon).toBeCloseTo(-1.225, 2)
  })

  it('draws arcs at sea, bulging the way the swell goes', () => {
    const west = arcs(2, 12, 270)
    expect(west.length).toBeGreaterThan(10)
    for (const a of west) for (const [lon, lat] of a.coords) expect(isLand(lon, lat)).toBe(false)
    // Swell from the west: the middle of each arc is east of its ends.
    const [first, , , , mid, , , , last] = west[0].coords
    expect(mid[0]).toBeGreaterThan(first[0])
    expect(mid[0]).toBeGreaterThan(last[0])
    // Across the swell: ends one above the other.
    expect(first[1]).not.toBeCloseTo(last[1], 3)
  })

  it('shows the height in width and colour only', () => {
    expect(arcs(2, 12, 270).length).toBe(arcs(0.5, 12, 270).length)
    expect(arcs(2, 12, 270)[0].width).toBeGreaterThan(arcs(0.5, 12, 270)[0].width)
    expect(waveColor(2)).not.toBe(waveColor(0.5))
  })

  it('shows the period in rows: more and closer for a short one', () => {
    expect([crestRows(5), crestRows(9), crestRows(14)]).toEqual([4, 3, 2])
    expect(rowGap(6)).toBeLessThan(rowGap(14))
    expect(arcs(1, 6, 270).length).toBeGreaterThan(arcs(1, 14, 270).length)
  })

  it('draws nothing without waves', () => {
    expect(surfArcs(oceanCoast(), () => null, 10.5, bounds)).toEqual([])
  })
})
