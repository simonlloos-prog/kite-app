/**
 * Daylight, for the spot card: night hours are greyed and never count as a slot to go sailing.
 * Sunrise and sunset by the usual NOAA approximation (a minute or two off, plenty here).
 */
import type { LatLon } from './arome'
import { parisHourKey } from './time'

const RAD = Math.PI / 180

/** Sunrise and sunset (UTC ms) on the UTC day of `dayMs`, at a point. */
export function sunTimes(dayMs: number, p: LatLon): { rise: number; set: number } {
  const day0 = Math.floor(dayMs / 86_400_000) * 86_400_000
  const n = day0 / 86_400_000 - 10_957.5 + 0.5 // days since J2000.0, at noon
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda))
  // Equation of time, minutes.
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD
  const eot = 4 * (((L - ra + 540) % 360) - 180)
  // Sun 0.833° under the horizon: refraction and the sun's half width.
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(p.lat * RAD) * Math.sin(decl)) / (Math.cos(p.lat * RAD) * Math.cos(decl))
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD
  const noon = 720 - 4 * p.lon - eot // minutes UTC
  return { rise: day0 + (noon - 4 * H) * 60_000, set: day0 + (noon + 4 * H) * 60_000 }
}

/** UTC ms of a Paris hour key (YYYY-MM-DDTHH:00): Paris is UTC+1 in winter, UTC+2 in summer. */
export function parisKeyToMs(key: string): number {
  const asUtc = Date.parse(`${key}:00Z`)
  for (const offset of [1, 2]) {
    const t = asUtc - offset * 3_600_000
    if (parisHourKey(new Date(t)) === key) return t
  }
  return asUtc - 3_600_000
}

/** Whether most of a Paris hour is in daylight: its middle between sunrise and sunset. */
export function isDayHour(key: string, p: LatLon): boolean {
  const mid = parisKeyToMs(key) + 1_800_000
  const { rise, set } = sunTimes(mid, p)
  return mid >= rise && mid <= set
}
