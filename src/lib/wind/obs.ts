/** Wind measured at stations (Météo-France, Holfuy, Weameter), written by pipeline/fetch_obs.py. */
import { distanceKm } from '../spots/spots'
import type { LatLon } from './arome'

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

/**
 * Seconds per turn of a station's fan: faster with the wind, so strength reads at a glance.
 * Still under 1 kn; 6 s up to 2 kn, 3 s at 4 kn, 1 s at 12 kn, 0.5 s from 24 kn. Twice as
 * slow as first tried: light winds already spun fast.
 */
export function spinSeconds(kn: number): number {
  if (!(kn >= 1)) return 0
  return Math.max(0.5, Math.min(6, 12 / kn))
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
