/**
 * "Mix" map: the wind, lighter, and the waves only where they matter, along the ocean beaches, as
 * short crest arcs in the water just off the sand, like « ) ) ) » rolling in: across the swell and
 * bulging the way it goes (its direction), in more and closer rows for a short period, fewer and
 * further apart for a long one (its period), wider for a bigger swell (its height),
 * always white foam on a blue halo (windLayers.ts). Every arc has the same length.
 */
import { isLand } from '../map/land'
import type { Bounds } from './field'
import type { WaveAt } from './wave'

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
  /** Wave height, m: the line's width. */
  hs: number
  width: number
}

/** Nearest crest to the sand, px: ~100 m at zoom 11, never on the coastline itself. */
const FIRST_PX = 5

/** Line width, px: thin for a ripple, thick for a big swell. */
export const crestWidth = (hs: number) => Math.min(5, 1 + hs * 1.1)
/** Rows of crests, from the period: many close waves for a short one (wind sea), few for a long one (groundswell). */
export const crestRows = (tp: number) => (tp < 7 ? 4 : tp < 11 ? 3 : 2)
/** Gap between rows, px: tight for a short period, wide for a long one, like the wavelength. */
export const rowGap = (tp: number) => Math.min(24, Math.max(8, tp * 1.6))
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

/** Arc length, px, the same for every sea: the bulge shows where the waves go. */
export const ARC = { length: 24, bulge: 0.28 }

/** Crest arcs along the beaches in view, for a zoom (MapLibre's, 512 px tiles). */
export function surfArcs(points: CoastPoint[], waveAt: (p: CoastPoint) => WaveAt | null, zoom: number, bounds: Bounds): Crest[] {
  const degPx = 360 / (512 * 2 ** zoom)
  const out: Crest[] = []
  const L = ARC.length
  for (const { p, w, cos, row } of samples(points, waveAt, degPx, bounds, () => L * 1.25 + 6)) {
    const t = travel(w.dir)
    const c: [number, number] = [t[1], -t[0]]
    // Offshore: against the swell when it comes in from the sea, else straight west.
    const off = t[0] > 0.3 ? [-t[0], -t[1]] : [-1, 0]
    const gap = rowGap(w.tp)
    const at = (x: number, y: number): [number, number] => [p.lon + x * degPx, p.lat + y * degPx * cos]
    for (let k = 0; k < crestRows(w.tp); k++) {
      // Rows staggered: every other sample shifts its arcs by half a gap.
      const d = FIRST_PX + L * ARC.bulge + k * gap + (row % 2) * gap * 0.5
      const coords: [number, number][] = []
      for (let i = 0; i <= 8; i++) {
        const u = i / 4 - 1
        const x = off[0] * d + c[0] * (u * L) / 2 + t[0] * L * ARC.bulge * (1 - u * u)
        const y = off[1] * d + c[1] * (u * L) / 2 + t[1] * L * ARC.bulge * (1 - u * u)
        coords.push(at(x, y))
      }
      if (coords.some(([lon, lat]) => isLand(lon, lat))) continue
      out.push({ coords, hs: w.hs, width: crestWidth(w.hs) })
    }
  }
  return out
}
