/** Hourly sea level at the Bassin inlet (see pipeline/fetch_tide.py). */
export interface TideSeries {
  /** Where the heights come from: "api-maree.fr (Eyrac)", or "Open-Meteo" as a fallback. */
  source?: string
  /** ISO UTC hours. */
  times: string[]
  /** Metres above mean sea level. */
  heights: number[]
}

export interface Tide {
  /** Where the hour sits between low water (0) and high water (1). */
  level: number
  rising: boolean
  /** Hours from the nearest high water: negative before it, positive after. */
  fromHigh: number
  /** Water level, metres above mean sea level (the series' own mean, so the model's datum drops out). */
  height: number
}

/** Below this share of the range, the Bassin is too dry to sail: greyed on the map. */
export const LOW_TIDE = 1 / 3
/** Half a tide cycle (12 h 25): the hours either side that hold the low and the high water. */
const HALF_CYCLE_H = 6

/** High waters, as fractional indices into the hourly series: the top of a parabola through 3 hours. */
export function highWaters(heights: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < heights.length - 1; i++) {
    const [a, b, c] = [heights[i - 1], heights[i], heights[i + 1]]
    if (b >= a && b > c) out.push(i + (a - c) / (2 * (a - 2 * b + c)))
  }
  return out
}

/** Tide at each hour of the series, by ISO UTC hour. Hours too close to the ends are left out. */
export function tideByTime({ times, heights }: TideSeries): Map<string, Tide> {
  const out = new Map<string, Tide>()
  const highs = highWaters(heights)
  const mean = heights.reduce((s, h) => s + h, 0) / heights.length
  for (let i = HALF_CYCLE_H; i < heights.length - HALF_CYCLE_H; i++) {
    const around = heights.slice(i - HALF_CYCLE_H, i + HALF_CYCLE_H + 1)
    const lo = Math.min(...around)
    const hi = Math.max(...around)
    if (hi - lo < 0.1 || !highs.length) continue
    const high = highs.reduce((best, h) => (Math.abs(h - i) < Math.abs(best - i) ? h : best))
    out.set(times[i], { level: (heights[i] - lo) / (hi - lo), rising: heights[i + 1] > heights[i - 1], fromHigh: i - high, height: heights[i] - mean })
  }
  return out
}

/** `marée basse ↑`, `mi-marée ↓`, `marée haute ↑` */
export function tideLabel(t: Tide): string {
  const name = t.level < LOW_TIDE ? 'marée basse' : t.level > 1 - LOW_TIDE ? 'marée haute' : 'mi-marée'
  return `${name} ${t.rising ? '↑' : '↓'}`
}
