/** Wind measured at stations (Météo-France, Holfuy, Weameter), written by pipeline/fetch_obs.py. */
import { distanceKm } from '../spots/spots'
import type { LatLon } from './arome'
import { meanDir } from './obsSources'

export interface Obs extends LatLon {
  id: string
  name: string
  /** Who runs the station, shown with the measurement: "Météo-France", "Holfuy", "Weameter". */
  source: string
  /** Measurement time, ISO UTC (6-minute record). */
  time: string
  /** Mean wind, knots. */
  speed: number
  /** Where it blows from, degrees. */
  dir: number
  /** Max gust, knots, when the station gives it. */
  gust?: number
}

/** One reading of a station: ms UTC, knots, degrees. */
export interface ObsPoint {
  t: number
  speed: number
  gust: number
  dir: number
}

/** An average a station gives over a period: `10'`, `1h`… */
export interface ObsWindow {
  label: string
  speed: number
  gust: number
  dir: number
}

/** What a station measured lately (Worker, /history). */
export interface ObsHistory {
  id: string
  points: ObsPoint[]
  windows: ObsWindow[]
}

export type ObsBucket = ObsPoint

/** Readings grouped on round periods of `minutes`: mean speed, max gust, mean direction, oldest first. */
export function bucketize(points: ObsPoint[], minutes: number): ObsBucket[] {
  const size = minutes * 60_000
  const groups = new Map<number, ObsPoint[]>()
  for (const p of points) {
    const t = Math.floor(p.t / size) * size
    groups.set(t, [...(groups.get(t) ?? []), p])
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([t, g]) => ({ t, speed: g.reduce((a, p) => a + p.speed, 0) / g.length, gust: Math.max(...g.map((p) => p.gust)), dir: meanDir(g) }))
}

/**
 * Seconds per turn of a station's fan: faster with the wind, so strength reads at a glance.
 * Still under 1 kn; 8 s up to 2.5 kn, 5 s at 4 kn, 2 s at 10 kn, 1 s at 20 kn, 0.75 s from
 * 27 kn. Slowed down twice after trying it: light winds spun too fast.
 */
export function spinSeconds(kn: number): number {
  if (!(kn >= 1)) return 0
  return Math.max(0.75, Math.min(8, 20 / kn))
}

/** Older than this, a record says nothing about now: the station stopped sending. */
export const MAX_AGE_MIN = 75

/** Both lists, keeping the newest record of each station: the Worker's, or meta.json's when fresher. */
export function mergeObs(a: Obs[], b: Obs[]): Obs[] {
  const byId = new Map<string, Obs>()
  for (const o of [...a, ...b]) {
    const seen = byId.get(o.id)
    if (!seen || Date.parse(o.time) > Date.parse(seen.time)) byId.set(o.id, o)
  }
  return [...byId.values()]
}

/** Records recent enough to show as the current wind. */
export const freshObs = (obs: Obs[], now = Date.now()) => obs.filter((o) => now - Date.parse(o.time) <= MAX_AGE_MIN * 60_000)

/** The station closest to a spot, within reach: further away (La Hume from the Cap Ferret, 11 km
 * across the Bassin), it measures another wind. */
export function nearestObs(p: LatLon, obs: Obs[], maxKm = 10): Obs | null {
  let best: Obs | null = null
  let bestD = maxKm
  for (const o of obs) {
    const d = distanceKm(p, o)
    if (d <= bestD) [best, bestD] = [o, d]
  }
  return best
}

const clockFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' })

/** `2026-11-07T15:06:00Z` → `16 h 06` (Paris). */
export const obsClock = (time: string) => clockFmt.format(new Date(time)).replace(':', ' h ')
