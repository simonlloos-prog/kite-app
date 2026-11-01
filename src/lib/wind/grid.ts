import { GRID } from './cache'
import type { LatLon } from './openMeteo'

/** All multiples of GRID so grid points hit the same cache keys as the reticle. */
export const STEPS = [GRID, GRID * 2, GRID * 4, GRID * 8, GRID * 16, GRID * 32, GRID * 64]

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/** Smallest step that keeps points at least `minPx` apart on screen. */
export function pickStep(degPerPx: number, minPx = 64): number {
  const want = degPerPx * minPx
  return STEPS.find((s) => s >= want) ?? STEPS[STEPS.length - 1]
}

const nextStep = (s: number) => STEPS[Math.min(STEPS.indexOf(s) + 1, STEPS.length - 1)]

/** Each point counts as one Open-Meteo call (free tier: ~600/min, ~10k/day). */
export function gridPoints(b: Bounds, latStep: number, lonStep: number, maxPoints = 120): LatLon[] {
  for (;;) {
    const i0 = Math.ceil(b.south / latStep)
    const i1 = Math.floor(b.north / latStep)
    const j0 = Math.ceil(b.west / lonStep)
    const j1 = Math.floor(b.east / lonStep)
    const count = Math.max(0, i1 - i0 + 1) * Math.max(0, j1 - j0 + 1)
    const maxed = latStep === nextStep(latStep) && lonStep === nextStep(lonStep)
    if (count > maxPoints && !maxed) {
      latStep = nextStep(latStep)
      lonStep = nextStep(lonStep)
      continue
    }
    const pts: LatLon[] = []
    // Integer loops avoid float drift in the coordinates.
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) pts.push({ lat: i * latStep, lon: j * lonStep })
    return pts
  }
}
