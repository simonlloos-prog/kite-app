/**
 * A spot hour by hour, for its card: the rating of every forecast hour, and the stretches when it
 * can be sailed ("quand y aller"), the spots list answering "où".
 */
import type { WindAt } from '../wind/arome'
import { isDayHour } from '../wind/sun'
import type { Tide } from '../wind/tide'
import { rateSpot, type Rating } from './rating'
import type { Spot } from './spots'
import { sector, type Sector } from '../wind/units'

export interface SpotHour {
  /** Paris hour key, YYYY-MM-DDTHH:00. */
  time: string
  /** Null while the hour is not downloaded. */
  w: WindAt | null
  rating: Rating
  /** Most of the hour in daylight: night hours are greyed and never a slot. */
  day: boolean
}

export function spotHours(spot: Spot, times: string[], windAt: (t: string) => WindAt | null, tideAt: (t: string) => Tide | null): SpotHour[] {
  return times.map((time) => {
    const w = windAt(time)
    return { time, w, rating: rateSpot(spot, w, tideAt(time), time), day: isDayHour(time, spot) }
  })
}

export interface Window {
  /** First and last rideable hour, Paris hour keys. */
  from: string
  to: string
  /** Best score inside: 3 good, 2 strong, 1 light or average direction. */
  best: number
}

/**
 * Stretches of rideable daylight hours (score ≥ 1), each at least `minHours` long: one hour
 * alone is rarely worth the trip, and nobody sails at night.
 */
export function rideableWindows(hours: SpotHour[], minHours = 2): Window[] {
  const out: Window[] = []
  let start = -1
  for (let i = 0; i <= hours.length; i++) {
    const on = i < hours.length && hours[i].day && hours[i].rating.score > 0
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      if (i - start >= minHours) {
        const run = hours.slice(start, i)
        out.push({ from: run[0].time, to: run.at(-1)!.time, best: Math.max(...run.map((h) => h.rating.score)) })
      }
      start = -1
    }
  }
  return out
}

/**
 * « auj. 14 h – 18 h » for 14 h to 17 h included (it ends when the last hour does), « lun. 22 h –
 * mar. 2 h » across midnight, « dim. 20 h – minuit ».
 */
export function windowLabel(w: Window, today: string): string {
  const day = (key: string) => (key.slice(0, 10) === today ? 'auj.' : dayFmt.format(Date.parse(`${key.slice(0, 10)}T12:00Z`)))
  const end = Number(w.to.slice(11, 13)) + 1
  const sameDay = w.from.slice(0, 10) === w.to.slice(0, 10)
  const to = end === 24 ? 'minuit' : `${sameDay ? '' : `${day(w.to)} `}${end} h`
  return `${day(w.from)} ${Number(w.from.slice(11, 13))} h – ${to}`
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })

/** A slot across spots: the same hours, the same best rating, for one or more spots. */
export interface Slot extends Window {
  spots: Spot[]
  /** Mean wind range over the slot's rideable hours, knots. */
  minKn: number
  maxKn: number
  /** Where the wind comes from at the first and last hour, 16 sectors: shows a turning wind. */
  dirFrom: Sector
  dirTo: Sector
  /** Colour of the best hour's rating. */
  color: string
}

/**
 * Every rideable daylight slot to come, all spots together, by date ("quand et où"). Spots sharing
 * the exact same hours and best rating share a row: the ocean beaches often go together.
 * `minBest` 2 keeps the good and strong slots only.
 */
export function upcomingSlots(
  spots: Spot[],
  times: string[],
  windAt: (spot: Spot, t: string) => WindAt | null,
  tideAt: (t: string) => Tide | null,
  minBest = 1,
): Slot[] {
  const byKey = new Map<string, Slot>()
  for (const spot of spots) {
    const hours = spotHours(spot, times, (t) => windAt(spot, t), tideAt)
    for (const w of rideableWindows(hours)) {
      if (w.best < minBest) continue
      const run = hours.filter((h) => h.time >= w.from && h.time <= w.to)
      const speeds = run.map((h) => h.w!.speed)
      const top = run.find((h) => h.rating.score === w.best)!
      const key = `${w.from}|${w.to}|${w.best}`
      const s = byKey.get(key) ?? {
        ...w,
        spots: [],
        minKn: Infinity,
        maxKn: -Infinity,
        dirFrom: sector(run[0].w!.dir),
        dirTo: sector(run.at(-1)!.w!.dir),
        color: top.rating.color,
      }
      s.spots.push(spot)
      s.minKn = Math.min(s.minKn, ...speeds)
      s.maxKn = Math.max(s.maxKn, ...speeds)
      byKey.set(key, s)
    }
  }
  return [...byKey.values()].sort((a, b) => a.from.localeCompare(b.from) || b.best - a.best || b.spots.length - a.spots.length)
}
