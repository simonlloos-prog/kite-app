/**
 * The map (the former "Mix" mode, the only one since 22 nov. 2026): the wind, lighter, and the waves only where they matter, along the ocean beaches, as
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
export const crestWidth = (hs: number) => Math.min(3.5, 1 + hs * 0.65)
/** Rows of crests, from the period: many close waves for a short one (wind sea), few for a long one (groundswell). */
export const crestRows = (tp: number) => (tp < 7 ? 4 : tp < 11 ? 3 : 2)
/** Gap between rows, px: tight for a short period, wide for a long one, like the wavelength. */
export const rowGap = (tp: number) => Math.min(16, Math.max(6, tp * 1.1))
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
export const ARC = { length: 16, bulge: 0.28 }
/** Screen px between trains along the beach. */
const TRAIN_EVERY = 36
/**
 * Seconds for a crest to move in by one row. The same for every sea, so a long period (wide gaps)
 * rolls in faster than a short one, as real swell does (its speed grows with the period).
 */
export const ROW_SECONDS = 2.5

/** The crests rolling in at one point of the beach: where they come from and how they look. */
export interface Train {
  /** Foot of the train, on the coastline. */
  lon: number
  lat: number
  cos: number
  /** Where the swell goes, across it and offshore: unit vectors (east, north) in screen pixels. */
  t: [number, number]
  c: [number, number]
  off: [number, number]
  gap: number
  rows: number
  width: number
  hs: number
  /** Rows of head start: every other train is half a row ahead, so they do not march in step. */
  lead: number
}

/** Rolling trains of crests along the beaches in view, for a zoom (MapLibre's, 512 px tiles). */
export function surfTrains(points: CoastPoint[], waveAt: (p: CoastPoint) => WaveAt | null, zoom: number, bounds: Bounds): Train[] {
  const degPx = 360 / (512 * 2 ** zoom)
  return samples(points, waveAt, degPx, bounds, () => TRAIN_EVERY).map(({ p, w, cos, row }) => {
    const t = travel(w.dir)
    // Offshore: against the swell when it comes in from the sea, else straight west.
    const off: [number, number] = t[0] > 0.3 ? [-t[0], -t[1]] : [-1, 0]
    return { lon: p.lon, lat: p.lat, cos, t, c: [t[1], -t[0]], off, gap: rowGap(w.tp), rows: crestRows(w.tp), width: crestWidth(w.hs), hs: w.hs, lead: (row % 2) * 0.5 }
  })
}

/** A crest of a train: its points in screen pixels from the train's foot (east, north), and how visible it is. */
export interface TrainCrest {
  pts: [number, number][]
  alpha: number
}

/**
 * The crests of a train after `rows` rows travelled: each moves in towards the sand, fades out
 * there and comes back from the far row, faded in. Crests that touch land are left out.
 */
export function trainCrests(tr: Train, rows: number, degPx: number): TrainCrest[] {
  const L = ARC.length
  const out: TrainCrest[] = []
  for (let k = 0; k < tr.rows; k++) {
    // Distance out, in rows: decreasing with time, back to the far end once it reaches the sand.
    const s = (((k - rows - tr.lead) % tr.rows) + tr.rows) % tr.rows
    const alpha = Math.min(1, s / 0.6) * Math.min(1, (tr.rows - s) / 0.8)
    if (alpha <= 0.02) continue
    const d = FIRST_PX + L * ARC.bulge + s * tr.gap
    const pts: [number, number][] = []
    for (let i = 0; i <= 8; i++) {
      const u = i / 4 - 1
      const bulge = L * ARC.bulge * (1 - u * u)
      pts.push([tr.off[0] * d + tr.c[0] * (u * L) / 2 + tr.t[0] * bulge, tr.off[1] * d + tr.c[1] * (u * L) / 2 + tr.t[1] * bulge])
    }
    if (pts.some(([x, y]) => isLand(tr.lon + x * degPx, tr.lat + y * degPx * tr.cos))) continue
    out.push({ pts, alpha })
  }
  return out
}

/** A wave height written beside the crests, offshore: the width alone does not tell a size. */
export interface SurfLabel {
  lon: number
  lat: number
  text: string
}

/** Screen px between labels along the beach; sooner when the height changes. */
const LABEL_EVERY = 110
const LABEL_SOONER = 55
/** Beyond the farthest row, px. */
const LABEL_OUT = 10

export const heightText = (hs: number) => `${hs.toFixed(1).replace('.', ',')} m`

/** Height labels along the beaches in view, just off the farthest crests of their train. */
export function surfLabels(trains: Train[], zoom: number): SurfLabel[] {
  const degPx = 360 / (512 * 2 ** zoom)
  const out: SurfLabel[] = []
  let last: Train | null = null
  for (const tr of trains) {
    if (last) {
      const dist = Math.hypot((tr.lon - last.lon) / degPx, (tr.lat - last.lat) / (degPx * tr.cos))
      // Sooner only for a real change: 4,8 then 4,7 m is the same sea.
      const changed = Math.abs(tr.hs - last.hs) >= Math.max(0.3, last.hs * 0.15)
      if (dist < (changed ? LABEL_SOONER : LABEL_EVERY)) continue
    }
    const d = FIRST_PX + ARC.length * ARC.bulge + tr.rows * tr.gap + LABEL_OUT
    out.push({ lon: tr.lon + tr.off[0] * d * degPx, lat: tr.lat + tr.off[1] * d * degPx * tr.cos, text: heightText(tr.hs) })
    last = tr
  }
  return out
}

/** Where still trains stop (no animation): no crest half faded at either end. */
export const STILL_ROWS = -0.75

/** Still crest arcs along the beaches in view, as map coordinates (the trains at rest). */
export function surfArcs(points: CoastPoint[], waveAt: (p: CoastPoint) => WaveAt | null, zoom: number, bounds: Bounds): Crest[] {
  const degPx = 360 / (512 * 2 ** zoom)
  return surfTrains(points, waveAt, zoom, bounds).flatMap((tr) =>
    trainCrests(tr, STILL_ROWS, degPx).map(({ pts }) => ({
      coords: pts.map(([x, y]): [number, number] => [tr.lon + x * degPx, tr.lat + y * degPx * tr.cos]),
      hs: tr.hs,
      width: tr.width,
    })),
  )
}
