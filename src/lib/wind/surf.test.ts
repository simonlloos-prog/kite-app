import { describe, expect, it } from 'vitest'
import { isLand } from '../map/land'
import { crestRows, heightText, rowGap, oceanCoast, surfArcs, surfLabels, surfTrains, trainCrests } from './surf'

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

  it('shows the height in the width only', () => {
    expect(arcs(2, 12, 270).length).toBe(arcs(0.5, 12, 270).length)
    expect(arcs(2, 12, 270)[0].width).toBeGreaterThan(arcs(0.5, 12, 270)[0].width)
  })

  it('rolls the crests in towards the sand, fading there and back from the far row', () => {
    const degPx = 360 / (512 * 2 ** 10.5)
    const tr = surfTrains(oceanCoast(), () => ({ hs: 1, tp: 9, dir: 270 }), 10.5, bounds).find((t) => t.lead === 0)!
    // Swell from the west: crests are west of the foot (x < 0); their middle comes closer to it with time.
    const middleX = (rows: number) => trainCrests(tr, rows, degPx).map((c) => c.pts[4][0])
    const [a, b] = [middleX(0.2), middleX(0.5)]
    expect(a.length).toBe(b.length)
    a.forEach((x, i) => expect(b[i]).toBeGreaterThan(x))
    // Just before reaching the sand a crest is almost gone; it comes back faint from the far row.
    const near = trainCrests(tr, 0.95, degPx).sort((p, q) => q.pts[4][0] - p.pts[4][0])
    expect(near[0].alpha).toBeLessThan(0.2)
    expect(trainCrests(tr, 1.05, degPx).every((c) => c.alpha > 0)).toBe(true)
  })

  it('writes the height off the crests, every so often along the beach', () => {
    expect(heightText(2.46)).toBe('2,5 m')
    const trains = surfTrains(oceanCoast(), (p) => ({ hs: p.lat > 44.85 ? 2 : 1, tp: 9, dir: 270 }), 10.5, bounds)
    const labels = surfLabels(trains, 10.5)
    expect(labels.length).toBeGreaterThan(1)
    expect(labels.length).toBeLessThanOrEqual(trains.length / 3)
    expect(new Set(labels.map((l) => l.text))).toEqual(new Set(['1,0 m', '2,0 m']))
    // Read at the foot of its train, on the coast, and written offshore of the crests, at sea.
    for (const l of labels) expect(trains.some((t) => t.lon === l.from.lon && t.lat === l.from.lat)).toBe(true)
    for (const l of labels) expect(isLand(l.lon, l.lat)).toBe(false)
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
