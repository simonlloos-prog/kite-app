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
/** South wind running along an ocean beach, a touch from the land: sailable with care. */
const SIDE_OFF: Rating = { score: 1, label: 'Side-off, prudence', color: '#f97316' }
const LIGHT: Rating = { score: 1, label: 'Léger', color: '#eab308' }

// The table uses 8 directions: each covers ±22.5°, up to halfway to its neighbours.
const SECTOR_TOLERANCE = 22.5

export type DirQuality = 'good' | 'ok' | 'offshore' | 'bad'

/**
 * The ocean coast runs roughly north-south, so the end of the "offshore" S sector is nearly
 * parallel to the beach: 195° and up already works like SW, 180–195° is sailable with care.
 * Below 180° the wind comes more from the land and stays red.
 */
const OCEAN_SIDE_OFF_FROM = 180
const OCEAN_SW_FROM = 195
const isOcean = (spot: Spot) => spot.area.startsWith('Océan')
const isSideOff = (spot: Spot, dir: number) => isOcean(spot) && dir >= OCEAN_SIDE_OFF_FROM && dir < OCEAN_SW_FROM

export function dirQuality(spot: Spot, dir: number): DirQuality {
  if (isOcean(spot) && dir >= OCEAN_SW_FROM && dir <= 202.5) return 'good'
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
  if (dir === 'offshore') return isSideOff(spot, w.dir) && w.speed <= 32 ? SIDE_OFF : OFFSHORE
  else if (w.speed < 15) r = LIGHT
  else if (w.speed <= 25) r = { score: 3, label: 'Bon', color: '#22c55e' }
  else if (w.speed <= 32) r = { score: 2, label: 'Fort', color: '#f97316' }
  else return { ...NO, label: 'Trop fort' }
  // 👍 directions work, but less well: one notch down.
  if (dir === 'ok') return r.score === 3 ? { ...LIGHT, label: 'Bon, direction moyenne' } : { ...r, score: 1, label: `${r.label}, direction moyenne` }
  return r
}
