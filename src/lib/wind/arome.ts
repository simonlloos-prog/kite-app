/** Data written by pipeline/fetch_arome.py: one meta file and one binary file per forecast hour. */
import type { TideSeries } from './tide'

export interface LatLon {
  lat: number
  lon: number
}

/** Regular lat/lon grid. Row 0 is the southern edge, column 0 the western edge. */
export interface Grid {
  south: number
  west: number
  step: number
  rows: number
  cols: number
}

export interface Meta {
  model: string
  /** Run time, ISO UTC. */
  run: string
  grid: Grid
  /** Knots per stored unit. */
  scale: number
  /** Validity times, ISO UTC, one per file. */
  times: string[]
  /** Hour files, relative to the data folder. */
  files: string[]
  /** Latest AROME-PI gusts, when the pipeline could fetch them (see pipeline/fetch_aromepi.py). */
  pi?: {
    /** Run time, ISO UTC: AROME-PI runs every hour. */
    run: string
    /** Validity times, ISO UTC, one per hour in the file. */
    times: string[]
    /** uint8 per cell and hour, hours one after another, `scale` kn per unit. */
    file: string
  }
  /** Sea level at the Bassin inlet, when the pipeline could fetch it (see pipeline/fetch_tide.py). */
  tide?: TideSeries
}

/** One forecast hour over the grid, in knots. Index = row * cols + col. */
export interface Hour {
  /** Eastward component. */
  u: Float32Array
  /** Northward component. */
  v: Float32Array
  /** Max gust over the previous hour, NaN when missing (analysis). */
  gust: Float32Array
}

export interface WindAt {
  speed: number
  gust: number
  /** Where the wind comes from, degrees. */
  dir: number
}

export function decodeHour(buf: ArrayBuffer, grid: Grid, scale: number): Hour {
  const n = grid.rows * grid.cols
  if (buf.byteLength !== 3 * n) throw new Error(`Fichier AROME inattendu : ${buf.byteLength} octets au lieu de ${3 * n}`)
  const signed = new Int8Array(buf)
  const bytes = new Uint8Array(buf)
  const hour: Hour = { u: new Float32Array(n), v: new Float32Array(n), gust: new Float32Array(n) }
  for (let k = 0; k < n; k++) {
    hour.u[k] = signed[k] * scale
    hour.v[k] = signed[n + k] * scale
    const g = bytes[2 * n + k]
    hour.gust[k] = g === 255 ? NaN : g * scale
  }
  return hour
}

/** Direction the wind comes from, from its east/north components. */
export const dirFrom = (u: number, v: number) => ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360

export const nodeAt = (g: Grid, r: number, c: number): LatLon => ({ lat: g.south + r * g.step, lon: g.west + c * g.step })

/** Index of the nearest cell, or null outside the grid. */
export function cellOf(g: Grid, p: LatLon): number | null {
  const r = Math.round((p.lat - g.south) / g.step)
  const c = Math.round((p.lon - g.west) / g.step)
  return r < 0 || c < 0 || r >= g.rows || c >= g.cols ? null : r * g.cols + c
}

export function windAt(g: Grid, h: Hour | undefined, p: LatLon): WindAt | null {
  const k = h ? cellOf(g, p) : null
  if (k === null) return null
  const { u, v, gust } = h!
  return { speed: Math.hypot(u[k], v[k]), gust: gust[k], dir: dirFrom(u[k], v[k]) }
}
