/**
 * Land or sea at a point, from land.json (pipeline/land_mask.mjs): the wave map's lines and values
 * stop at the coastline, like its bands. A ~200 m raster, built once by scanlines, so that a
 * check costs nothing even for every point of every line.
 */
import type { MultiPolygon } from 'geojson'
import land from './land.json'

/** Raster step, degrees (~200 m north-south). */
const STEP = 0.002

export interface LandRaster {
  south: number
  west: number
  step: number
  rows: number
  cols: number
  /** 1 = land, row 0 at the south. */
  cells: Uint8Array
}

/** Even-odd fill of the polygons' rings, sampled at cell centres. */
export function rasterize(polys: number[][][][], step: number): LandRaster {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        west = Math.min(west, x)
        east = Math.max(east, x)
        south = Math.min(south, y)
        north = Math.max(north, y)
      }
  const cols = Math.ceil((east - west) / step)
  const rows = Math.ceil((north - south) / step)
  const cells = new Uint8Array(rows * cols)
  const xs: number[] = []
  for (let r = 0; r < rows; r++) {
    const y = south + (r + 0.5) * step
    xs.length = 0
    for (const poly of polys)
      for (const ring of poly)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]
          const [xj, yj] = ring[j]
          if (yi > y !== yj > y) xs.push(xi + ((xj - xi) * (y - yi)) / (yj - yi))
        }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - west) / step - 0.5))
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - west) / step - 0.5))
      cells.fill(1, r * cols + c0, c1 >= c0 ? r * cols + c1 + 1 : r * cols + c0)
    }
  }
  return { south, west, step, rows, cols, cells }
}

export function onRaster(m: LandRaster, lon: number, lat: number): boolean {
  const r = Math.floor((lat - m.south) / m.step)
  const c = Math.floor((lon - m.west) / m.step)
  return r >= 0 && r < m.rows && c >= 0 && c < m.cols && m.cells[r * m.cols + c] === 1
}

let raster: LandRaster | null = null
/** Whether a point is on land (outside the mask: sea). */
export function isLand(lon: number, lat: number): boolean {
  raster ??= rasterize((land as MultiPolygon).coordinates, STEP)
  return onRaster(raster, lon, lat)
}

/** A line cut where it crosses the land, at the coast: the pieces at sea, two points at least. */
export function seaPieces(line: [number, number][]): [number, number][][] {
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  let prev: [number, number] | null = null
  let prevLand = false
  for (const p of line) {
    const onLand = isLand(p[0], p[1])
    if (prev && onLand !== prevLand) {
      const edge = coastBetween(prevLand ? p : prev, prevLand ? prev : p)
      if (onLand) {
        cur.push(edge)
        if (cur.length > 1) out.push(cur)
        cur = []
      } else cur = [edge]
    }
    if (!onLand) cur.push(p)
    prev = p
    prevLand = onLand
  }
  if (cur.length > 1) out.push(cur)
  return out
}

/** The coast between a sea point and a land point, by halving: lines end on it, not one step short. */
function coastBetween(sea: [number, number], ashore: [number, number]): [number, number] {
  let [a, b] = [sea, ashore]
  for (let i = 0; i < 8; i++) {
    const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    if (isLand(m[0], m[1])) b = m
    else a = m
  }
  return a
}
