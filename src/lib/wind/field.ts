import { keyOf, windCache } from './cache'
import { COLS, nodeAt, ROWS } from './domain'
import { valueAt } from './openMeteo'

export type Kind = 'speed' | 'gust'

/**
 * Density level of a grid symbol: 0 = every other row and column (always shown),
 * 1 = the rest (shown when zoomed in). Keeps the grid even at every zoom.
 */
export const levelOf = (r: number, c: number): 0 | 1 => (r % 2 === 0 && c % 2 === 0 ? 0 : 1)

const RAD = Math.PI / 180

export interface Streamline {
  /** `[lon, lat]` points, upwind first. */
  coords: [number, number][]
  /** Where the wind goes at the downwind end, degrees from north. */
  bearing: number
  /** 0 = coarse set (zoomed out), 1 = fine set (zoomed in). */
  set: 0 | 1
}

/** Seed spacing of the coarse set, in grid cells. The fine set uses half of it. */
export const SEED_SPACING = 0.5
/** Line length relative to the seed spacing: above 1, neighbours overlap into continuous strokes. */
const LENGTH = 1.6
/** Integration step, in grid cells. */
const H = 0.05

/**
 * Continuous wind lines, Meteociel-like: from each seed of a regular lattice, follow the
 * interpolated wind both ways. Directions are averaged as vectors, so 350° and 10° give 0°.
 * Works in grid-index space, corrected for longitude degrees being shorter than latitude ones.
 */
export function streamlines(time: string, cache = windCache): Streamline[] {
  // East and north components of where the wind goes.
  const u: number[][] = []
  const v: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    u.push([])
    v.push([])
    for (let c = 0; c < COLS; c++) {
      const w = valueAt(cache.get(keyOf(nodeAt(r, c))), time)
      const ok = w && !Number.isNaN(w.dir)
      u[r].push(ok ? -Math.sin(w.dir * RAD) * w.speed : NaN)
      v[r].push(ok ? -Math.cos(w.dir * RAD) * w.speed : NaN)
    }
  }
  const cosLat = Math.cos(nodeAt(ROWS / 2, 0).lat * RAD)

  /** Unit step (in physical "row" units) at a fractional position, or null where there is no wind. */
  const dirAt = (fr: number, fc: number): [number, number] | null => {
    if (fr < 0 || fc < 0 || fr > ROWS - 1 || fc > COLS - 1) return null
    const e = bilinear(u, fr, fc)
    const n = bilinear(v, fr, fc)
    const norm = Math.hypot(e, n)
    if (!(norm > 1e-6)) return null
    return [n / norm, e / norm / cosLat]
  }

  const trace = (fr: number, fc: number, sign: 1 | -1, length: number): [number, number][] => {
    const pts: [number, number][] = []
    for (let s = 0; s < length; s += H) {
      // Midpoint (RK2) keeps curved lines smooth.
      const d1 = dirAt(fr, fc)
      if (!d1) break
      const d2 = dirAt(fr + (sign * H * d1[0]) / 2, fc + (sign * H * d1[1]) / 2)
      if (!d2) break
      fr += sign * H * d2[0]
      fc += sign * H * d2[1]
      pts.push([fr, fc])
    }
    return pts
  }

  const lines: Streamline[] = []
  for (const set of [0, 1] as const) {
    const spacing = SEED_SPACING / (set + 1)
    const length = spacing * LENGTH
    for (let fr = spacing / 2; fr < ROWS - 1; fr += spacing) {
      for (let fc = spacing / 2; fc < COLS - 1; fc += spacing) {
        const pts = [...trace(fr, fc, -1, length / 2).reverse(), [fr, fc] as [number, number], ...trace(fr, fc, 1, length / 2)]
        if (pts.length < 3) continue
        const coords = pts.map(([r, c]) => {
          const p = nodeAt(r, c)
          return [p.lon, p.lat] as [number, number]
        })
        const [[lon0, lat0], [lon1, lat1]] = coords.slice(-2)
        const bearing = (Math.atan2((lon1 - lon0) * cosLat, lat1 - lat0) / RAD + 360) % 360
        lines.push({ coords, bearing, set })
      }
    }
  }
  return lines
}

/** Values over the domain at one hour, `[row][col]`, NaN where missing. */
export function fieldAt(time: string, kind: Kind, cache = windCache): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) {
      const s = cache.get(keyOf(nodeAt(r, c)))
      const i = s ? s.times.indexOf(time) : -1
      row.push(i < 0 ? NaN : s![kind][i])
    }
    grid.push(row)
  }
  return grid
}

/** Bilinear sample at fractional row/col indices. */
export function bilinear(grid: number[][], fr: number, fc: number): number {
  const r0 = Math.min(Math.floor(fr), grid.length - 2)
  const c0 = Math.min(Math.floor(fc), grid[0].length - 2)
  const tr = fr - r0
  const tc = fc - c0
  const top = grid[r0][c0] * (1 - tc) + grid[r0][c0 + 1] * tc
  const bottom = grid[r0 + 1][c0] * (1 - tc) + grid[r0 + 1][c0 + 1] * tc
  return top * (1 - tr) + bottom * tr
}
