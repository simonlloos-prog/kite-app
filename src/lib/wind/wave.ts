/**
 * MFWAM waves (pipeline/fetch_mfwam.py): wave height, peak period and primary swell direction on
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
  /** Field order in the file: hs, tp, dir. */
  fields: string[]
  scales: { hs: number; tp: number }
  /** Validity times, ISO UTC, one per hour in the file. */
  times: string[]
  /** uint8, hours then fields then rows (0 = south) then columns, 255 = land. */
  file: string
}

export interface WaveAt {
  /** Significant wave height, m. */
  hs: number
  /** Peak period, s. */
  tp: number
  /** Primary swell direction, where it comes from, degrees. */
  dir: number
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
  return { hs: field('hs') * meta.scales.hs, tp: field('tp') * meta.scales.tp, dir: (field('dir') * 360) / 256 }
}

/**
 * Stepped wave height scale for the map, metres: `[lower bound, colour]`, ascending. Same colour
 * logic as the wind (blues for small, then green to purple), so the map reads the same way.
 */
export const WAVE_BINS: [number, string][] = [
  [0, '#ffffff'],
  [0.25, '#dcecff'],
  [0.5, '#b3d4fb'],
  [0.75, '#84b4f2'],
  [1, '#5590e3'],
  [1.25, '#2f6bcf'],
  [1.5, '#19c27a'],
  [2, '#b4e61e'],
  [2.5, '#f2e01a'],
  [3, '#f7861a'],
  [4, '#ef4b2a'],
  [5, '#b0127a'],
  [6, '#5b21b6'],
]

export interface WaveField {
  /** Wave height per cell, m, NaN on land: for the values. */
  hs: Float32Array
  /** The same, spread COAST_CELLS cells inland (fillCoast): for the bands, which the map then
   * cuts at the real coastline. MFWAM calls "land" the cells that touch the beach. */
  bands: Float32Array
  /** Unit vector where the primary swell goes (east, north), NaN on land: for the lines. */
  u: Float32Array
  v: Float32Array
}

/** Map fields of hour `h`, on the wave grid. */
export function waveField(meta: WaveMeta, data: Uint8Array, h: number): WaveField {
  const n = meta.grid.rows * meta.grid.cols
  const base = h * meta.fields.length * n
  const at = (name: string) => base + meta.fields.indexOf(name) * n
  const [ihs, idir] = [at('hs'), at('dir')]
  const hs = new Float32Array(n)
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    if (data[ihs + k] === LAND) {
      hs[k] = u[k] = v[k] = NaN
      continue
    }
    hs[k] = data[ihs + k] * meta.scales.hs
    const to = ((data[idir + k] * 360) / 256 + 180) * (Math.PI / 180)
    u[k] = Math.sin(to)
    v[k] = Math.cos(to)
  }
  return { hs, bands: fillCoast(hs, meta.grid.rows, meta.grid.cols, COAST_CELLS), u, v }
}

/** How far the bands are spread inland, in cells (2.5 km each): every beach is within 2 km of a sea cell. */
const COAST_CELLS = 2

/**
 * `values` with its NaN cells next to known ones filled by the mean of their known neighbours
 * (8 around), ring after ring, `rings` times. The rest stays NaN.
 */
export function fillCoast(values: Float32Array, rows: number, cols: number, rings: number): Float32Array {
  let cur = values
  for (let ring = 0; ring < rings; ring++) {
    const next = cur.slice()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        if (!Number.isNaN(cur[k])) continue
        let sum = 0
        let count = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr
            const cc = c + dc
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
            const x = cur[rr * cols + cc]
            if (!Number.isNaN(x)) (sum += x), count++
          }
        }
        if (count) next[k] = sum / count
      }
    }
    cur = next
  }
  return cur
}

/** Map value: « 0,5 », « 1,3 ». */
export const fmtHeight = (m: number) => m.toFixed(1).replace('.', ',')

/** « 0,5 m · 13 s · O » */
export function fmtWave(w: WaveAt): string {
  const hs = fmtHeight(w.hs)
  return `${hs} m · ${Math.round(w.tp)} s · ${sector(w.dir)}`
}
