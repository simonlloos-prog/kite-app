/**
 * AROME-PI: Météo-France's hourly immediate-forecast run (next 6 hours). It only gives gusts,
 * so it is not drawn on the map: it tells whether the fresher run expects stronger or weaker
 * gusts than the AROME 0.01° run on display.
 */
import type { Grid } from './arome'

/** One Float32Array of gusts (kn, NaN when missing) per hour in the file. */
export function decodePi(buf: ArrayBuffer, grid: Grid, hours: number, scale: number): Float32Array[] {
  const n = grid.rows * grid.cols
  const bytes = new Uint8Array(buf)
  if (bytes.length !== hours * n) throw new Error(`Fichier AROME-PI inattendu : ${bytes.length} octets au lieu de ${hours * n}`)
  return Array.from({ length: hours }, (_, h) => Float32Array.from(bytes.subarray(h * n, (h + 1) * n), (b) => (b === 255 ? NaN : b * scale)))
}

export interface GustTrend {
  /** Mean difference AROME-PI − AROME over the shared hours, knots. */
  delta: number
  trend: 'up' | 'down' | 'flat'
}

/** Below this mean difference the two runs agree: gusts are rounded to 0.5 kn anyway. */
const SIGNIFICANT_KN = 1.5

/** Compare hour by hour, as `[arome, pi]` gust pairs; null when no hour can be compared. */
export function gustTrend(pairs: [number, number][]): GustTrend | null {
  const ok = pairs.filter(([a, p]) => !Number.isNaN(a) && !Number.isNaN(p))
  if (!ok.length) return null
  const delta = ok.reduce((s, [a, p]) => s + p - a, 0) / ok.length
  return { delta, trend: delta >= SIGNIFICANT_KN ? 'up' : delta <= -SIGNIFICANT_KN ? 'down' : 'flat' }
}
