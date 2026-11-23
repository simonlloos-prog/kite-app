/**
 * MFWAM waves (pipeline/fetch_mfwam.py): wave height, peak period and dominant wave direction on
 * their own 0.025° grid, coarser than AROME. Only the sea has values: next to the beach, the
 * nearest sea cell is read.
 */
import type { Grid, LatLon } from './arome'
import { sector } from './units'

export interface WaveMeta {
  model: string
  /** Run time, ISO UTC: a new run every 6 h. */
  run: string
  grid: Grid
  /** Field order in the file: hs, tp, dir, then the wave systems' sea_h, sea_tp, sea_dir, sw1_…, sw2_…
   * (runs from before 23 nov. 2026 have the first three only). */
  fields: string[]
  scales: { hs: number; tp: number }
  /** Validity times, ISO UTC, one per hour in the file. */
  times: string[]
  /** uint8, hours then fields then rows (0 = south) then columns, 255 = land. */
  file: string
}

/** One wave system: the wind sea, the primary or the secondary swell. */
export interface WaveSystem {
  /** Significant height, m. */
  hs: number
  /** Mean period, s. */
  tp: number
  /** Where it comes from, degrees. */
  dir: number
}

export const SYSTEMS = [
  { key: 'sw1', label: 'Houle' },
  { key: 'sea', label: 'Mer du vent' },
  { key: 'sw2', label: 'Houle secondaire' },
] as const
export type SystemKey = (typeof SYSTEMS)[number]['key']

/** Below this height a system is left out: there is none. */
const MIN_SYSTEM_M = 0.1

export interface WaveAt {
  /** Significant wave height, m. */
  hs: number
  /** Peak period, s. */
  tp: number
  /** Direction of the dominant waves (wind sea or primary swell), where they come from, degrees. */
  dir: number
  /** The wave systems, when the run has them; a missing one (under 0.1 m) is absent. */
  systems?: Partial<Record<SystemKey, WaveSystem>>
}

const LAND = 255
/** Farthest sea cell read for a point: every ocean beach has one within 2 km. */
const MAX_KM = 3

export function checkWave(buf: ArrayBuffer, meta: WaveMeta): Uint8Array {
  const want = meta.times.length * meta.fields.length * meta.grid.rows * meta.grid.cols
  const bytes = new Uint8Array(buf)
  if (bytes.length !== want) throw new Error(`Fichier de houle inattendu : ${bytes.length} octets au lieu de ${want}`)
  return bytes
}

/** Waves of hour `h` at the sea cell nearest to the point, within MAX_KM; null on land or outside. */
export function waveAt(meta: WaveMeta, data: Uint8Array, h: number, p: LatLon): WaveAt | null {
  const { south, west, step, rows, cols } = meta.grid
  const n = rows * cols
  const base = h * meta.fields.length * n
  const r0 = Math.round((p.lat - south) / step)
  const c0 = Math.round((p.lon - west) / step)
  const kmLat = 111.32
  const kmLon = 111.32 * Math.cos((p.lat * Math.PI) / 180)
  const reach = Math.ceil(MAX_KM / (step * kmLon))
  let best = -1
  let bestKm = MAX_KM
  for (let r = r0 - reach; r <= r0 + reach; r++) {
    for (let c = c0 - reach; c <= c0 + reach; c++) {
      if (r < 0 || r >= rows || c < 0 || c >= cols || data[base + r * cols + c] === LAND) continue
      const km = Math.hypot((south + r * step - p.lat) * kmLat, (west + c * step - p.lon) * kmLon)
      if (km <= bestKm) {
        bestKm = km
        best = r * cols + c
      }
    }
  }
  if (best < 0) return null
  const field = (name: string) => data[base + meta.fields.indexOf(name) * n + best]
  const out: WaveAt = { hs: field('hs') * meta.scales.hs, tp: field('tp') * meta.scales.tp, dir: (field('dir') * 360) / 256 }
  if (meta.fields.includes('sw1_h')) {
    out.systems = {}
    for (const { key } of SYSTEMS) {
      const hs = field(`${key}_h`) * meta.scales.hs
      if (hs >= MIN_SYSTEM_M)
        out.systems[key] = { hs, tp: field(`${key}_tp`) * meta.scales.tp, dir: (field(`${key}_dir`) * 360) / 256 }
    }
  }
  return out
}

const RHO = 1025 // sea water, kg/m³
const G = 9.81
/**
 * Wave energy, kJ, like the surfing sites show it (surf-forecast, Surfline; they do not publish
 * their formula): the energy of one wave, per metre of crest, in deep water, ρgH²/8 over a
 * wavelength gT²/2π, with the significant height and the peak period. Height squared times
 * period squared: 1 m at 10 s ≈ 200 kJ, 2 m at 14 s ≈ 1 500 kJ.
 */
export const waveEnergy = (w: { hs: number; tp: number }) =>
  ((RHO * G * w.hs * w.hs) / 8) * ((G * w.tp * w.tp) / (2 * Math.PI)) / 1000

/** « 0,5 m · 13 s · O » */
export function fmtWave(w: { hs: number; tp: number; dir: number }): string {
  const hs = w.hs.toFixed(1).replace('.', ',')
  return `${hs} m · ${Math.round(w.tp)} s · ${sector(w.dir)}`
}
