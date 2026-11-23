import { describe, expect, it } from 'vitest'
import { checkWave, fmtWave, waveAt, wavePower, type WaveMeta } from './wave'

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

  it('formats like the spot list', () => {
    expect(fmtWave({ hs: 0.52, tp: 12.8, dir: 271 })).toBe('0,5 m · 13 s · O')
    expect(fmtWave({ hs: 1.25, tp: 9, dir: 300 })).toBe('1,3 m · 9 s · ONO')
  })

  it('reads the wave systems when the run has them', () => {
    const fields = ['hs', 'tp', 'dir', 'sea_h', 'sea_tp', 'sea_dir', 'sw1_h', 'sw1_tp', 'sw1_dir', 'sw2_h', 'sw2_tp', 'sw2_dir']
    const m = { ...meta, fields, times: [meta.times[0]], grid: { ...meta.grid, rows: 1, cols: 1 } }
    // 2 m from the west at 7 s (wind sea), 1.5 m from the WNW at 14 s, no secondary swell.
    const d = Uint8Array.from([40, 120, 192, 40, 70, 192, 30, 140, 203, 1, 90, 0])
    expect(waveAt(m, d, 0, { lat: 45, lon: -1.3 })!.systems).toEqual({
      sea: { hs: 2, tp: 7, dir: 270 },
      sw1: { hs: 1.5, tp: 14, dir: (203 * 360) / 256 },
    })
    expect(waveAt(meta, data, 0, { lat: 45.025, lon: -1.275 })!.systems).toBeUndefined()
  })

  it('gives the wave power', () => {
    expect(wavePower({ hs: 1, tp: 8 })).toBeCloseTo(3.5, 1)
    expect(wavePower({ hs: 2, tp: 14 })).toBeCloseTo(24.7, 1)
  })
})
