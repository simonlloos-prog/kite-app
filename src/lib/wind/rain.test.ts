import { describe, expect, it } from 'vitest'
import type { Grid } from './arome'
import { decodeRain, fmtRain, rainAt, type RainMeta } from './rain'

const grid: Grid = { south: 44, west: -2, step: 0.01, rows: 1, cols: 2 }
const meta: RainMeta = {
  run: '2026-11-23T15:00:00Z',
  fields: ['rr', 'cape'],
  scales: { rr: 0.1, cape: 20 },
  times: ['2026-11-25T11:00Z'],
  file: 'rain.bin',
}

describe('rain', () => {
  // Cell 0: 0.3 mm, CAPE 100; cell 1: 2.4 mm, CAPE 800.
  const hours = decodeRain(Uint8Array.from([3, 24, 5, 40]).buffer, grid, meta)

  it('decodes rain and CAPE per hour', () => {
    expect(hours[0].rr[1]).toBeCloseTo(2.4)
    expect(hours[0].cape[1]).toBe(800)
    expect(() => decodeRain(new ArrayBuffer(3), grid, meta)).toThrow('Fichier de pluie inattendu')
  })

  it('flags a storm only with rain and enough CAPE', () => {
    expect(rainAt(grid, hours[0], { lat: 44, lon: -2 })!.storm).toBe(false)
    expect(rainAt(grid, hours[0], { lat: 44, lon: -1.99 })!.storm).toBe(true)
    expect(fmtRain(0.6)).toBe('0,6 mm')
    expect(fmtRain(2.4)).toBe('2 mm')
  })
})
