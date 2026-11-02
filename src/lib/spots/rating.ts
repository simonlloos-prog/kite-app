import type { WindAt } from '../wind/arome'
import type { Tide } from '../wind/tide'
import { angleDiff, sectorAngle } from '../wind/units'
import type { Spot } from './spots'

export interface Rating {
  /** Higher is better, for sorting: 3 good, 2 strong, 1 light or average direction, 0 not rideable. */
  score: 0 | 1 | 2 | 3
  label: string
  color: string
}

const NO: Rating = { score: 0, label: '—', color: '#94a3b8' }
/** Wind from the land: carries the rider out, never rated, flagged in red. */
const OFFSHORE: Rating = { score: 0, label: 'Offshore ⚠ dangereux', color: '#dc2626' }
const LIGHT: Rating = { score: 1, label: 'Léger', color: '#eab308' }

// The table uses 8 directions: each covers ±22.5°, up to halfway to its neighbours.
const SECTOR_TOLERANCE = 22.5

export type DirQuality = 'good' | 'ok' | 'offshore' | 'bad'

export function dirQuality(spot: Spot, dir: number): DirQuality {
  const near = (s: (typeof spot.good)[number]) => angleDiff(sectorAngle(s), dir) <= SECTOR_TOLERANCE
  if (spot.good.some(near)) return 'good'
  if (spot.ok.some(near)) return 'ok'
  if (spot.offshore.some(near)) return 'offshore'
  return 'bad'
}

/** Outside the spot's window around high water, when both are known. */
export const tooDry = (spot: Spot, tide: Tide | null) =>
  spot.tide !== undefined && tide !== null && Math.abs(tide.fromHigh) > spot.tide

export function rateSpot(spot: Spot, w: WindAt | null, tide: Tide | null = null): Rating {
  if (!w) return NO
  // The wind first: a light day stays "too light", whatever the tide.
  const r = rateWind(spot, w)
  return r.score > 0 && tooDry(spot, tide) ? { ...NO, label: 'Marée trop basse' } : r
}

function rateWind(spot: Spot, w: WindAt): Rating {
  const dir = dirQuality(spot, w.dir)
  if (dir === 'bad') return { ...NO, label: 'Direction défavorable' }
  let r: Rating
  if (w.speed < 12) return { ...NO, label: 'Trop faible' }
  if (dir === 'offshore') return OFFSHORE
  else if (w.speed < 15) r = LIGHT
  else if (w.speed <= 25) r = { score: 3, label: 'Bon', color: '#22c55e' }
  else if (w.speed <= 32) r = { score: 2, label: 'Fort', color: '#f97316' }
  else return { ...NO, label: 'Trop fort' }
  // 👍 directions work, but less well: one notch down.
  if (dir === 'ok') return r.score === 3 ? { ...LIGHT, label: 'Bon, direction moyenne' } : { ...r, score: 1, label: `${r.label}, direction moyenne` }
  return r
}
