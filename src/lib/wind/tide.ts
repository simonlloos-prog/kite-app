/** Hourly sea level at the Bassin inlet (see pipeline/fetch_tide.py). */
export interface TideSeries {
  /** ISO UTC hours. */
  times: string[]
  /** Metres above mean sea level. */
  heights: number[]
}

export interface Tide {
  /** Where the hour sits between low water (0) and high water (1). */
  level: number
  rising: boolean
}

/** Below this share of the range, the Bassin is too dry to sail: greyed on the map. */
export const LOW_TIDE = 1 / 3
/** Half a tide cycle (12 h 25): the hours either side that hold the low and the high water. */
const HALF_CYCLE_H = 6

/** Tide at each hour of the series, by ISO UTC hour. Hours too close to the ends are left out. */
export function tideByTime({ times, heights }: TideSeries): Map<string, Tide> {
  const out = new Map<string, Tide>()
  for (let i = HALF_CYCLE_H; i < heights.length - HALF_CYCLE_H; i++) {
    const around = heights.slice(i - HALF_CYCLE_H, i + HALF_CYCLE_H + 1)
    const lo = Math.min(...around)
    const hi = Math.max(...around)
    if (hi - lo < 0.1) continue
    out.set(times[i], { level: (heights[i] - lo) / (hi - lo), rising: heights[i + 1] > heights[i - 1] })
  }
  return out
}

/** `marée basse ↑`, `mi-marée ↓`, `marée haute ↑` */
export function tideLabel(t: Tide): string {
  const name = t.level < LOW_TIDE ? 'marée basse' : t.level > 1 - LOW_TIDE ? 'marée haute' : 'mi-marée'
  return `${name} ${t.rising ? '↑' : '↓'}`
}
