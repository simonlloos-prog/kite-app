/**
 * "Mix" map: the wind, lighter, and the waves only where they matter, along the ocean beaches, as
 * short crest arcs in the water just off the sand, like « ) ) ) » rolling in: across the swell and
 * bulging the way it goes (its direction), short and close together for a short period, long and
 * far apart for a long one (its period), in more rows, wider and warmer in colour (WAVE_BINS) for
 * a bigger swell (its height).
 */
import { isLand } from '../map/land'
import type { Bounds } from './field'
import { WAVE_BINS, type WaveAt } from './wave'

export interface CoastPoint {
  lat: number
  lon: number
}

/** Ocean beaches: Pointe de Grave (north) to the south of BOX. */
const COAST = { south: 43.56, north: 45.56, step: 0.002 }
/** Scan from this far west for the first land, eastwards. */
const SCAN = { west: -1.7, east: -1.1, step: 0.0005 }

let coast: CoastPoint[] | null = null
/** The ocean coastline, one point every ~220 m north-south: the first land met going east. */
export function oceanCoast(): CoastPoint[] {
  if (coast) return coast
  coast = []
  for (let lat = COAST.south; lat <= COAST.north; lat += COAST.step) {
    for (let lon = SCAN.west; lon <= SCAN.east; lon += SCAN.step) {
      if (isLand(lon, lat)) {
        coast.push({ lat, lon: lon - SCAN.step / 2 })
        break
      }
    }
  }
  return coast
}

export interface Crest {
  coords: [number, number][]
  /** Wave height, m: the line's width and colour. */
  hs: number
  color: string
  width: number
}

/** Nearest crest to the sand, px: ~100 m at zoom 11, never on the coastline itself. */
const FIRST_PX = 5

export const waveColor = (hs: number) => WAVE_BINS.reduce((c, [min, col]) => (hs >= min ? col : c), WAVE_BINS[0][1])
/** Line width, px: thin for a ripple, thick for a big swell. */
export const crestWidth = (hs: number) => Math.min(5, 1 + hs * 1.1)
/** Rows of crests: one for a small sea, up to three for a big swell. */
export const crestRows = (hs: number) => (hs < 0.75 ? 1 : hs < 1.5 ? 2 : 3)
/** Where the swell goes (east, north), unit vector. */
const travel = (dir: number): [number, number] => {
  const to = ((dir + 180) * Math.PI) / 180
  return [Math.sin(to), Math.cos(to)]
}

/** Coast points in view, one every `px(w)` screen pixels or more along the beach, with their waves. */
function samples(points: CoastPoint[], waveAt: (p: CoastPoint) => WaveAt | null, degPx: number, bounds: Bounds, px: (w: WaveAt) => number) {
  const out: { p: CoastPoint; w: WaveAt; cos: number; row: number }[] = []
  let last: CoastPoint | null = null
  let need = 0
  let n = 0
  for (const p of points) {
    if (p.lat < bounds.south - 0.05 || p.lat > bounds.north + 0.05 || p.lon < bounds.west - 0.1 || p.lon > bounds.east + 0.1) continue
    const cos = Math.cos((p.lat * Math.PI) / 180)
    const dist = last ? Math.hypot((p.lon - last.lon) / degPx, (p.lat - last.lat) / (degPx * cos)) : Infinity
    if (dist < need) continue
    const w = waveAt(p)
    if (!w || w.hs < 0.05) continue
    out.push({ p, w, cos, row: n++ })
    last = p
    need = px(w)
  }
  return out
}

/** Arc length, px: short for a short period (wind sea), long for a long one (groundswell). */
export const arcLength = (tp: number) => Math.min(34, Math.max(8, (tp - 3) * 3))

/** Crest arcs along the beaches in view, for a zoom (MapLibre's, 512 px tiles). */
export function surfArcs(points: CoastPoint[], waveAt: (p: CoastPoint) => WaveAt | null, zoom: number, bounds: Bounds): Crest[] {
  const degPx = 360 / (512 * 2 ** zoom)
  const out: Crest[] = []
  for (const { p, w, cos, row } of samples(points, waveAt, degPx, bounds, (w) => arcLength(w.tp) * 1.25 + 6)) {
    const t = travel(w.dir)
    const c: [number, number] = [t[1], -t[0]]
    // Offshore: against the swell when it comes in from the sea, else straight west.
    const off = t[0] > 0.3 ? [-t[0], -t[1]] : [-1, 0]
    const L = arcLength(w.tp)
    const rowGap = Math.min(20, Math.max(10, w.tp * 1.3))
    const at = (x: number, y: number): [number, number] => [p.lon + x * degPx, p.lat + y * degPx * cos]
    for (let k = 0; k < crestRows(w.hs); k++) {
      // Rows staggered: every other sample shifts its arcs by half a gap.
      const d = FIRST_PX + L * 0.25 + k * rowGap + (row % 2) * rowGap * 0.5
      const coords: [number, number][] = []
      for (let i = 0; i <= 8; i++) {
        const u = i / 4 - 1
        const x = off[0] * d + c[0] * (u * L) / 2 + t[0] * L * 0.22 * (1 - u * u)
        const y = off[1] * d + c[1] * (u * L) / 2 + t[1] * L * 0.22 * (1 - u * u)
        coords.push(at(x, y))
      }
      if (coords.some(([lon, lat]) => isLand(lon, lat))) continue
      out.push({ coords, hs: w.hs, color: waveColor(w.hs), width: crestWidth(w.hs) })
    }
  }
  return out
}
