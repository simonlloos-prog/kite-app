/** Wind measured by Météo-France stations, written by pipeline/fetch_obs.py. */
import { distanceKm } from '../spots/spots'
import type { LatLon } from './arome'

export interface Obs extends LatLon {
  id: string
  name: string
  /** Measurement time, ISO UTC (6-minute record). */
  time: string
  /** Mean wind, knots. */
  speed: number
  /** Where it blows from, degrees. */
  dir: number
  /** Max gust, knots, when the station gives it. */
  gust?: number
}

/** Older than this, a record says nothing about now: the station stopped sending. */
export const MAX_AGE_MIN = 75

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
