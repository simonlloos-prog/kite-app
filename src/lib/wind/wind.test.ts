import { describe, expect, it } from 'vitest'
import { cellOf, decodeHour, dirFrom, nodeAt, windAt, type Grid, type Hour } from './arome'
import { gridSymbols, sample, strideFor, valuesOf } from './field'
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

  it('alternates values and arrows on the lattice', () => {
    const { labels, strokes } = gridSymbols(grid, uniform(270, 12), valuesOf(uniform(270, 12), 'speed'), 2, all)
    const lattice = Math.ceil(grid.rows / 2) * Math.ceil(grid.cols / 2)
    expect(labels.length + strokes.length).toBe(lattice)
    expect(labels.length).toBe(Math.floor(grid.rows / 4 + 0.5) * Math.floor(grid.cols / 4 + 0.5))
    expect(labels[0].value).toBe(12)
  })

  it('points arrows where the wind goes', () => {
    const { strokes } = gridSymbols(grid, uniform(270, 12), valuesOf(uniform(270, 12), 'speed'), 4, all)
    for (const { shaft } of strokes) {
      const [[lon0, lat0], [lon1, lat1]] = shaft
      expect(lon1).toBeGreaterThan(lon0) // westerly → heads east
      expect(lat1).toBeCloseTo(lat0, 9)
    }
    const north = gridSymbols(grid, uniform(180, 12), valuesOf(uniform(180, 12), 'speed'), 4, all).strokes[0].shaft
    expect(north[1][1]).toBeGreaterThan(north[0][1]) // southerly → heads north
  })

  it('only emits what is on screen and skips calm cells', () => {
    const small = { west: -1.2, south: 44.6, east: -1.1, north: 44.7 }
    const { labels, strokes } = gridSymbols(grid, uniform(270, 12), valuesOf(uniform(270, 12), 'speed'), 1, small)
    expect(labels.length + strokes.length).toBe(11 * 11)
    for (const s of strokes) expect(s.shaft[0][0]).toBeGreaterThan(small.west - 0.01)
    expect(gridSymbols(grid, uniform(0, 0), new Float32Array(n), 1, small).strokes).toHaveLength(0)
    expect(nodeAt(grid, 1, 1)).toEqual({ lat: 44.11, lon: -1.89 })
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
