import { GRID } from './cache'
import type { LatLon } from './openMeteo'

/** Fixed area loaded once for every hour: swiping through time needs no request. */
export const DOMAIN = { south: 44.5, north: 44.85, west: -1.35, east: -0.95 }
export const STEP = GRID * 2
export const ROWS = Math.round((DOMAIN.north - DOMAIN.south) / STEP) + 1
export const COLS = Math.round((DOMAIN.east - DOMAIN.west) / STEP) + 1

/** Row 0 is the southern edge, column 0 the western edge. */
export const nodeAt = (r: number, c: number): LatLon => ({ lat: DOMAIN.south + r * STEP, lon: DOMAIN.west + c * STEP })

export function domainPoints(): LatLon[] {
  const pts: LatLon[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) pts.push(nodeAt(r, c))
  return pts
}

/** Closest node, or null when the point is outside the area. */
export function nearestNode(p: LatLon): LatLon | null {
  const r = Math.round((p.lat - DOMAIN.south) / STEP)
  const c = Math.round((p.lon - DOMAIN.west) / STEP)
  return r < 0 || c < 0 || r >= ROWS || c >= COLS ? null : nodeAt(r, c)
}
