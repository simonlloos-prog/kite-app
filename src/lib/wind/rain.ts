/**
 * AROME 0.01° rain and storm index (pipeline/fetch_rain.py), on the AROME grid: precipitation of
 * the hour (mm) and CAPE (J/kg), the energy storms can draw on.
 */
import { cellOf, type Grid, type LatLon } from './arome'

export interface RainMeta {
  /** Run time, ISO UTC: the AROME run. */
  run: string
  /** Field order in the file: rr, cape. */
  fields: string[]
  scales: { rr: number; cape: number }
  /** Validity times, ISO UTC, one per hour in the file. */
  times: string[]
  /** uint8, hours then fields then rows (0 = south) then columns. */
  file: string
}

export interface RainHour {
  /** Precipitation of the hour, mm. */
  rr: Float32Array
  /** CAPE, J/kg. */
  cape: Float32Array
}

export function decodeRain(buf: ArrayBuffer, grid: Grid, meta: RainMeta): RainHour[] {
  const n = grid.rows * grid.cols
  const bytes = new Uint8Array(buf)
  const want = meta.times.length * meta.fields.length * n
  if (bytes.length !== want) throw new Error(`Fichier de pluie inattendu : ${bytes.length} octets au lieu de ${want}`)
  const rrAt = meta.fields.indexOf('rr')
  const capeAt = meta.fields.indexOf('cape')
  return meta.times.map((_, h) => {
    const base = h * meta.fields.length * n
    const rr = new Float32Array(n)
    const cape = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      rr[i] = bytes[base + rrAt * n + i] * meta.scales.rr
      cape[i] = bytes[base + capeAt * n + i] * meta.scales.cape
    }
    return { rr, cape }
  })
}

/** Rain levels drawn on the map, mm in the hour: light, moderate, heavy. */
export const RAIN_LEVELS = [0.5, 2, 5]

/**
 * CAPE from which a storm is possible, J/kg. Rain is needed too: CAPE alone, under a clear sky,
 * makes no storm. A first guess, to check against real days.
 */
export const STORM_CAPE = 500
/** Rain in the hour that, with STORM_CAPE, makes a storm worth flagging, mm. */
export const STORM_RAIN = 1

export interface RainAt {
  rr: number
  cape: number
  storm: boolean
}

export function rainAt(grid: Grid, h: RainHour | undefined, p: LatLon): RainAt | null {
  const k = h ? cellOf(grid, p) : null
  if (k === null) return null
  const rr = h!.rr[k]
  const cape = h!.cape[k]
  return { rr, cape, storm: cape >= STORM_CAPE && rr >= STORM_RAIN }
}

/** « 2 mm », « 0,6 mm » */
export const fmtRain = (mm: number) => `${mm < 1 ? mm.toFixed(1).replace('.', ',') : Math.round(mm)} mm`
