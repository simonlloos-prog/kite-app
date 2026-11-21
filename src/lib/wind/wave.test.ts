import { describe, expect, it } from 'vitest'
import { checkWave, fillCoast, fmtWave, inPolygons, passesFade, waveAt, waveField, type WaveMeta } from './wave'

// 3 rows × 4 cols at 0.025°, from 45.00 N / 1.30 W; the east column (−1.225) is land.
const meta: WaveMeta = {
  model: 'MFWAM 0.025°',
  run: '2026-11-14T06:00:00Z',
  grid: { south: 45, west: -1.3, step: 0.025, rows: 3, cols: 4 },
  fields: ['hs', 'tp', 'dir'],
  scales: { hs: 0.05, tp: 0.1 },
  times: ['2026-11-14T13:00Z', '2026-11-14T14:00Z'],
  file: 'wave.bin',
}
const n = 12
const data = new Uint8Array(2 * 3 * n)
for (let h = 0; h < 2; h++)
  for (let k = 0; k < n; k++) {
    const land = k % 4 === 3
    const at = (f: number) => h * 3 * n + f * n + k
    data[at(0)] = land ? 255 : 10 + h * 10 + k // 0.55 m … at hour 0
    data[at(1)] = land ? 255 : 130
    data[at(2)] = land ? 255 : 192 // 270°
  }

describe('waves', () => {
  it('checks the file size', () => {
    expect(checkWave(data.buffer, meta)).toHaveLength(72)
    expect(() => checkWave(new ArrayBuffer(10), meta)).toThrow('Fichier de houle inattendu')
  })

  it('reads the cell under a sea point', () => {
    expect(waveAt(meta, data, 0, { lat: 45.025, lon: -1.275 })).toEqual({ hs: (10 + 5) * 0.05, tp: 13, dir: 270 })
    expect(waveAt(meta, data, 1, { lat: 45.025, lon: -1.275 })!.hs).toBeCloseTo((20 + 5) * 0.05)
  })

  it('takes the nearest sea cell from the beach, not too far', () => {
    // On the land column, 0.003° west of it: the sea cell next door (col 2).
    expect(waveAt(meta, data, 0, { lat: 45.05, lon: -1.228 })!.hs).toBeCloseTo((10 + 10) * 0.05)
    expect(waveAt(meta, data, 0, { lat: 45.05, lon: -1.1 })).toBeNull()
  })

  it('builds the map fields: height, and where the swell goes', () => {
    const f = waveField(meta, data, 0)
    expect(f.hs[5]).toBeCloseTo(0.75)
    expect(Number.isNaN(f.hs[3])).toBe(true)
    // From the west (270°): goes east.
    expect(f.u[5]).toBeCloseTo(1)
    expect(f.v[5]).toBeCloseTo(0)
  })

  it('spreads the bands onto the land next to the sea, not the values', () => {
    const f = waveField(meta, data, 0)
    // Land col 3, row 1: mean of its sea neighbours in col 2 (cells 2, 6, 10).
    expect(f.bands[7]).toBeCloseTo(((12 + 16 + 20) / 3) * 0.05)
    expect(Number.isNaN(f.hs[7])).toBe(true)
    expect(f.bands[5]).toBe(f.hs[5])
  })

  it('fills ring after ring, and no further', () => {
    const v = new Float32Array([1, NaN, NaN, NaN])
    expect(Array.from(fillCoast(v, 1, 4, 2))).toEqual([1, 1, 1, NaN])
  })

  it('leaves the Bassin without waves', () => {
    const g = { south: 44.6, west: -1.3, step: 0.05, rows: 3, cols: 7 }
    const m = { ...meta, grid: g, times: ['2026-11-14T13:00Z'] }
    const d = new Uint8Array(3 * 21).fill(20)
    const f = waveField(m, d, 0)
    // Row 1 = 44.65 N: −1.3 (ocean, west of Cap Ferret) has waves; −1.1 (mid-Bassin) has none.
    expect(f.hs[7]).toBeCloseTo(1)
    expect(Number.isNaN(f.hs[7 + 4])).toBe(true)
  })

  it('tells inside from outside, holes too', () => {
    const square = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b], [a, a]]
    const polys = [[square(0, 10), square(4, 6)]]
    expect(inPolygons(polys, 2, 2)).toBe(true)
    expect(inPolygons(polys, 5, 5)).toBe(false)
    expect(inPolygons(polys, 12, 5)).toBe(false)
  })

  it('fades the swell out through the passes', () => {
    expect(passesFade(-1.3, 44.6)).toBe(0) // open sea
    expect(passesFade(-1.22, 44.64)).toBe(1) // inner passes, north of the red line
    expect(passesFade(-1.2, 44.5)).toBe(0) // dune du Pilat, south of the black line
    const mid = passesFade(-1.23, 44.61)
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(1)
    // Closer to the red line, more hidden.
    expect(passesFade(-1.23, 44.62)).toBeGreaterThan(mid)
  })

  it('formats like the spot list', () => {
    expect(fmtWave({ hs: 0.52, tp: 12.8, dir: 271 })).toBe('0,5 m · 13 s · O')
    expect(fmtWave({ hs: 1.25, tp: 9, dir: 300 })).toBe('1,3 m · 9 s · ONO')
  })
})
