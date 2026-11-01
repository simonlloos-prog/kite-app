import { contours } from 'd3-contour'
import { nodeAt, type Grid, type Hour } from './arome'

export type Kind = 'speed' | 'gust'

/** Value per cell for the colour bands and the labels. */
export function valuesOf(h: Hour, kind: Kind): Float32Array {
  if (kind === 'gust') return h.gust
  const out = new Float32Array(h.u.length)
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(h.u[k], h.v[k])
  return out
}

/** Bilinear sample at fractional row/col indices, clamped to the grid. */
export function sample(g: Grid, a: Float32Array, fr: number, fc: number): number {
  fr = Math.max(0, Math.min(g.rows - 1, fr))
  fc = Math.max(0, Math.min(g.cols - 1, fc))
  const r0 = Math.min(Math.floor(fr), g.rows - 2)
  const c0 = Math.min(Math.floor(fc), g.cols - 2)
  const tr = fr - r0
  const tc = fc - c0
  const i = r0 * g.cols + c0
  const top = a[i] * (1 - tc) + a[i + 1] * tc
  const bottom = a[i + g.cols] * (1 - tc) + a[i + g.cols + 1] * tc
  return top * (1 - tr) + bottom * tr
}

/** Screen pixels per grid cell along longitude (the narrowest). MapLibre zoom levels use 512 px tiles. */
export const pxPerCell = (g: Grid, zoom: number) => (g.step * 512 * 2 ** zoom) / 360

/** Smallest power-of-two stride that keeps labels at least `minPx` apart on screen. */
export function strideFor(g: Grid, zoom: number, minPx = 20): number {
  let k = 1
  while (k * pxPerCell(g, zoom) < minPx && k < 32) k *= 2
  return k
}

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/** Range of row/col indices inside the bounds, aligned on multiples of `k`. */
function indexRange(g: Grid, b: Bounds, k = 1) {
  // The epsilon keeps 59.99999 (float division) from dropping the edge row.
  const eps = 1e-6
  return {
    r0: Math.max(0, Math.ceil((b.south - g.south) / g.step / k - eps) * k),
    r1: Math.min(g.rows - 1, Math.floor((b.north - g.south) / g.step + eps)),
    c0: Math.max(0, Math.ceil((b.west - g.west) / g.step / k - eps) * k),
    c1: Math.min(g.cols - 1, Math.floor((b.east - g.west) / g.step + eps)),
  }
}

export interface Band {
  /** Lower bound of the band, knots. */
  min: number
  /** `[lon, lat]` rings, GeoJSON MultiPolygon coordinates. */
  polygons: [number, number][][][]
}

/**
 * Areas where the value is at least each threshold (cumulative, so draw them in order).
 * Vector shapes from marching squares with linear interpolation: crisp at every zoom.
 */
export function isobands(g: Grid, values: Float32Array, thresholds: number[]): Band[] {
  // d3-contour puts the value of cell (x, y) at (x + 0.5, y + 0.5).
  const toLonLat = ([x, y]: number[]): [number, number] => [g.west + (x - 0.5) * g.step, g.south + (y - 0.5) * g.step]
  return contours()
    .size([g.cols, g.rows])
    .thresholds(thresholds)(Array.from(values))
    .filter((c) => c.coordinates.length)
    .map((c) => ({ min: c.value, polygons: c.coordinates.map((poly) => poly.map((ring) => ring.map(toLonLat))) }))
}

export interface Label {
  coord: [number, number]
  value: number
}

/** Land fraction above which a cell counts as land. */
const LAND = 0.5

/**
 * Meteociel-like regular grid of values (knots, unrounded): every `k` cells, only what is on
 * screen, and none on land when a `land` mask is given.
 */
export function labels(g: Grid, values: Float32Array, k: number, bounds: Bounds, land?: Float32Array): Label[] {
  const out: Label[] = []
  const { r0, r1, c0, c1 } = indexRange(g, bounds, k)
  for (let r = r0; r <= r1; r += k) {
    for (let c = c0; c <= c1; c += k) {
      const i = r * g.cols + c
      if (Number.isNaN(values[i]) || (land && land[i] >= LAND)) continue
      const { lat, lon } = nodeAt(g, r, c)
      out.push({ coord: [lon, lat], value: values[i] })
    }
  }
  return out
}

/** Longest line, in steps each way from the seed. */
const MAX_STEPS = 600

/**
 * Evenly spaced wind lines (Jobard & Lefer): long continuous lines following the wind,
 * kept about `sep` cells apart. Each line runs upwind → downwind, so arrowheads placed along
 * it point where the wind goes. Directions are interpolated as vectors (350° and 10° give 0°).
 * Distances are physical: longitude cells are narrower by cos(lat). With a `land` mask,
 * lines stop at the coast.
 */
export function streamlines(g: Grid, h: Hour, sep: number, bounds: Bounds, land?: Float32Array): [number, number][][] {
  const cosLat = Math.cos(((g.south + (g.rows * g.step) / 2) * Math.PI) / 180)
  // Integration step in cells: fine enough to stay smooth on screen at every zoom.
  const H = Math.min(0.25, sep * 0.2)
  const { r0, r1, c0, c1 } = indexRange(g, bounds)
  // Work a little beyond the screen so lines enter and leave it naturally.
  const pad = 2 * sep
  const lo = { r: Math.max(0, r0 - pad), c: Math.max(0, c0 - pad / cosLat) }
  const hi = { r: Math.min(g.rows - 1, r1 + pad), c: Math.min(g.cols - 1, c1 + pad / cosLat) }

  /** Unit step (physical length 1, in row units) at a fractional position, or null. */
  const dirAt = (fr: number, fc: number): [number, number] | null => {
    if (fr < lo.r || fc < lo.c || fr > hi.r || fc > hi.c) return null
    if (land && sample(g, land, fr, fc) >= LAND) return null
    const e = sample(g, h.u, fr, fc)
    const n = sample(g, h.v, fr, fc)
    const norm = Math.hypot(e, n)
    return norm > 0.25 ? [n / norm, e / norm / cosLat] : null
  }

  // Occupancy grid of accepted points, in cells of `sep` (physical row units).
  const occ = new Map<string, [number, number, number][]>()
  const cellKey = (fr: number, fc: number) => `${Math.floor(fr / sep)},${Math.floor((fc * cosLat) / sep)}`
  const near = (fr: number, fc: number, dist: number, line: number) => {
    const i = Math.floor(fr / sep)
    const j = Math.floor((fc * cosLat) / sep)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const [r, c, id] of occ.get(`${i + di},${j + dj}`) ?? []) {
          if (id !== line && Math.hypot(r - fr, (c - fc) * cosLat) < dist) return true
        }
      }
    }
    return false
  }

  const trace = (fr: number, fc: number, sign: 1 | -1, line: number) => {
    const pts: [number, number][] = []
    for (let s = 0; s < MAX_STEPS; s++) {
      const d1 = dirAt(fr, fc)
      if (!d1) break
      // Midpoint (RK2) keeps curved lines smooth.
      const d2 = dirAt(fr + (sign * H * d1[0]) / 2, fc + (sign * H * d1[1]) / 2)
      if (!d2) break
      fr += sign * H * d2[0]
      fc += sign * H * d2[1]
      if (near(fr, fc, sep * 0.5, line)) break
      pts.push([fr, fc])
    }
    return pts
  }

  const lines: [number, number][][] = []
  let id = 0
  for (let fr = lo.r + sep / 2; fr <= hi.r; fr += sep) {
    for (let fc = lo.c + sep / 2 / cosLat; fc <= hi.c; fc += sep / cosLat) {
      if (!dirAt(fr, fc) || near(fr, fc, sep, -1)) continue
      const line = id++
      const pts = [...trace(fr, fc, -1, line).reverse(), [fr, fc] as [number, number], ...trace(fr, fc, 1, line)]
      // Too short to read a direction: drop it.
      if (pts.length * H < 1.5 * sep) continue
      for (const [r, c] of pts) {
        const key = cellKey(r, c)
        const list = occ.get(key)
        if (list) list.push([r, c, line])
        else occ.set(key, [[r, c, line]])
      }
      lines.push(pts.map(([r, c]) => [g.west + c * g.step, g.south + r * g.step]))
    }
  }
  return lines
}
