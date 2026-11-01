import type { WindAt } from '../wind/arome'
import { angleDiff, sectorAngle } from '../wind/units'
import type { Spot } from './spots'

export interface Rating {
  /** Higher is better, for sorting: 3 good, 2 strong, 1 light, 0 not rideable. */
  score: 0 | 1 | 2 | 3
  label: string
  color: string
}

const NO: Rating = { score: 0, label: '—', color: '#94a3b8' }

// A favourable sector covers its neighbours halfway (±1.5 sectors).
const SECTOR_TOLERANCE = 33.75

export function rateSpot(spot: Spot, w: WindAt | null): Rating {
  if (!w) return NO
  if (!spot.sectors.some((s) => angleDiff(sectorAngle(s), w.dir) <= SECTOR_TOLERANCE))
    return { ...NO, label: 'Direction défavorable' }
  if (w.speed < 12) return { ...NO, label: 'Trop faible' }
  if (w.speed < 15) return { score: 1, label: 'Léger', color: '#eab308' }
  if (w.speed <= 25) return { score: 3, label: 'Bon', color: '#22c55e' }
  if (w.speed <= 32) return { score: 2, label: 'Fort', color: '#f97316' }
  return { ...NO, label: 'Trop fort' }
}
