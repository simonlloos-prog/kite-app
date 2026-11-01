import { describe, expect, it } from 'vitest'
import { cellOf, decodeHour, dirFrom, nodeAt, windAt, type Grid, type Hour } from './arome'
import { isobands, labels, sample, streamlines, strideFor, valuesOf } from './field'
import { formatHour, parisHourKey } from './time'
import { angleDiff, beaufort, sector } from './units'
import { BINS, binOf, windColor } from './windColor'

const grid: Grid = { south: 44.1, west: -1.9, step: 0.01, rows: 101, cols: 111 }
const n = grid.rows * grid.cols

/** Same wind everywhere, from `from` degrees at `kn` knots. */
function uniform(from: number, kn: number): Hour {
  const rad = (from * Math.PI) / 180
  return {
    u: new Float32Array(n).fill(-Math.sin(rad) * kn),
    v: new Float32Array(n).fill(-Math.cos(rad) * kn),
    gust: new Float32Array(n).fill(kn + 5),
  }
}

describe('arome data', () => {
  it('decodes the binary hour format written by the pipeline', () => {
    const buf = new ArrayBuffer(3 * n)
    const i8 = new Int8Array(buf)
    const u8 = new Uint8Array(buf)
    i8[0] = -20 // u = -10 kn
    i8[n] = 0
    u8[2 * n] = 30 // gust 15 kn
    u8[2 * n + 1] = 255 // missing
    const h = decodeHour(buf, grid, 0.5)
    expect(h.u[0]).toBe(-10)
    expect(h.gust[0]).toBe(15)
    expect(h.gust[1]).toBeNaN()
    expect(() => decodeHour(new ArrayBuffer(10), grid, 0.5)).toThrow()
  })

  it('turns components into where the wind comes from', () => {
    expect(dirFrom(-10, 0)).toBeCloseTo(90) // blowing west → from the east
    expect(dirFrom(0, -10)).toBeCloseTo(0) // blowing south → from the north
    expect(dirFrom(10, 0)).toBeCloseTo(270)
  })

  it('finds the nearest cell and its wind', () => {
    expect(cellOf(grid, { lat: 44.1, lon: -1.9 })).toBe(0)
    expect(cellOf(grid, { lat: 45.1, lon: -0.8 })).toBe(n - 1)
    expect(cellOf(grid, { lat: 46, lon: -1 })).toBeNull()
    const w = windAt(grid, uniform(270, 12), { lat: 44.68, lon: -1.17 })!
    expect(w.speed).toBeCloseTo(12)
    expect(w.dir).toBeCloseTo(270)
    expect(w.gust).toBe(17)
    expect(windAt(grid, undefined, { lat: 44.68, lon: -1.17 })).toBeNull()
  })
})

describe('field', () => {
  it('interpolates bilinearly and clamps to the grid', () => {
    const g: Grid = { south: 0, west: 0, step: 1, rows: 2, cols: 2 }
    const a = Float32Array.from([0, 10, 20, 30])
    expect(sample(g, a, 0, 0)).toBe(0)
    expect(sample(g, a, 0.5, 0.5)).toBe(15)
    expect(sample(g, a, 5, 5)).toBe(30)
  })

  it('computes speed or gust per cell', () => {
    const h = uniform(45, 10)
    expect(valuesOf(h, 'speed')[3]).toBeCloseTo(10)
    expect(valuesOf(h, 'gust')[3]).toBe(15)
  })

  it('picks a denser stride when zooming in', () => {
    expect(strideFor(grid, 14)).toBe(1)
    expect(strideFor(grid, 11)).toBe(1) // ~29 px per cell
    expect(strideFor(grid, 10)).toBe(2)
    expect(strideFor(grid, 8)).toBe(8)
  })

  const all = { west: -2, south: 44, east: -0.7, north: 45.2 }
  const small = { west: -1.2, south: 44.6, east: -1.1, north: 44.7 }

  it('lays values on a regular grid, only on screen', () => {
    const v = valuesOf(uniform(270, 12), 'speed')
    expect(labels(grid, v, 1, small)).toHaveLength(11 * 11)
    const coarse = labels(grid, v, 4, all)
    expect(coarse).toHaveLength(Math.ceil(grid.rows / 4) * Math.ceil(grid.cols / 4))
    expect(coarse[0]).toEqual({ coord: [-1.9, 44.1], value: 12 })
    expect(nodeAt(grid, 1, 1)).toEqual({ lat: 44.11, lon: -1.89 })
  })

  it('cuts vector bands at the thresholds, in lon/lat', () => {
    // Speed grows eastwards: 0 kn on the west edge to 22 kn on the east edge.
    const v = new Float32Array(n)
    for (let k = 0; k < n; k++) v[k] = ((k % grid.cols) / (grid.cols - 1)) * 22
    const bands = isobands(grid, v, [0, 10, 20])
    expect(bands.map((b) => b.min)).toEqual([0, 10, 20])
    const lons = (b: (typeof bands)[number]) => b.polygons.flat(2).map(([lon]) => lon)
    // The 10 kn band starts about 10/22 of the way east.
    expect(Math.min(...lons(bands[1]))).toBeCloseTo(-1.9 + (10 / 22) * 1.1, 2)
    expect(Math.max(...lons(bands[0]))).toBeCloseTo(-0.8 + 0.005, 3)
  })

  it('draws long continuous lines that go where the wind blows', () => {
    const lines = streamlines(grid, uniform(270, 12), 2, small)
    expect(lines.length).toBeGreaterThan(3)
    for (const line of lines) {
      const [first, last] = [line[0], line[line.length - 1]]
      expect(last[0]).toBeGreaterThan(first[0]) // westerly → heads east
      expect(last[1]).toBeCloseTo(first[1], 6)
      // Continuous: runs across the whole screen, not a short stroke.
      expect(last[0] - first[0]).toBeGreaterThan(small.east - small.west)
    }
    // Evenly spaced: neighbouring lines at least half the separation apart (2 cells = 0.02°).
    const lats = lines.map((l) => l[0][1]).sort((a, b) => a - b)
    for (let i = 1; i < lats.length; i++) expect(lats[i] - lats[i - 1]).toBeGreaterThan(0.01)
    const north = streamlines(grid, uniform(180, 12), 2, small)[0]
    expect(north[north.length - 1][1]).toBeGreaterThan(north[0][1]) // southerly → heads north
    expect(streamlines(grid, uniform(0, 0), 2, small)).toEqual([])
  })
})

describe('units, time & colours', () => {
  it('converts directions and Beaufort', () => {
    expect(sector(270)).toBe('O')
    expect(sector(-10)).toBe('N')
    expect(sector(315)).toBe('NO')
    expect(angleDiff(350, 10)).toBe(20)
    expect(beaufort(15)).toBe(4)
    expect(beaufort(70)).toBe(12)
  })

  it('formats Paris hours', () => {
    expect(parisHourKey(new Date('2026-11-01T13:30:00Z'))).toBe('2026-11-01T14:00')
    expect(parisHourKey(new Date('2026-07-01T13:30:00Z'))).toBe('2026-07-01T15:00')
    expect(parisHourKey(new Date('2026-11-01T20:00Z'))).toBe('2026-11-01T21:00')
    expect(formatHour('2026-11-01T14:00')).toBe('dim. 14h')
  })

  it('colors by strength in flat bins', () => {
    expect(windColor(0)).toBe('rgb(255 255 255)')
    expect(windColor(10)).toBe(windColor(11.9))
    expect(windColor(12)).not.toBe(windColor(11.9))
    expect(binOf(99)).toBe(BINS.length - 1)
    expect(binOf(NaN)).toBe(-1)
    expect(windColor(NaN)).toBe('rgb(148 163 184)')
  })
})
