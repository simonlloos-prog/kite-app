import { fetchWind, type LatLon, type WindSeries } from './openMeteo'

/** ~AROME HD mesh. Every point is snapped to it so target, grid and spots share entries. */
export const GRID = 0.0125
const TTL_MS = 30 * 60_000
const CHUNK = 100

export const snap = (v: number, step = GRID) => Math.round(v / step) * step

export const snapPoint = (p: LatLon): LatLon => ({ lat: snap(p.lat), lon: snap(p.lon) })

export const keyOf = (p: LatLon) => `${snap(p.lat).toFixed(4)},${snap(p.lon).toFixed(4)}`

export class WindCache {
  private entries = new Map<string, { at: number; series: WindSeries }>()

  get(key: string, now = Date.now()): WindSeries | undefined {
    const e = this.entries.get(key)
    return e && now - e.at < TTL_MS ? e.series : undefined
  }

  set(key: string, series: WindSeries, now = Date.now()) {
    this.entries.set(key, { at: now, series })
  }

  /** JSON turns NaN into null: `restore` turns it back. */
  serialize(): string {
    return JSON.stringify([...this.entries])
  }

  restore(json: string, now = Date.now()) {
    const nan = (a: (number | null)[]) => a.map((v) => (v == null ? NaN : v))
    for (const [key, { at, series: s }] of JSON.parse(json) as [string, { at: number; series: WindSeries }][]) {
      if (now - at < TTL_MS) this.entries.set(key, { at, series: { ...s, speed: nan(s.speed), gust: nan(s.gust), dir: nan(s.dir) } })
    }
  }

  /** Snapped, de-duplicated points that have no fresh entry. */
  missing(points: LatLon[], now = Date.now()): LatLon[] {
    const out = new Map<string, LatLon>()
    for (const p of points) {
      const k = keyOf(p)
      if (!out.has(k) && !this.get(k, now)) out.set(k, snapPoint(p))
    }
    return [...out.values()]
  }
}

export const windCache = new WindCache()

/** Fetch every point not already cached, in batched requests. */
export async function loadPoints(points: LatLon[], signal?: AbortSignal, cache = windCache): Promise<void> {
  const todo = cache.missing(points)
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK)
    const series = await fetchWind(chunk, signal)
    chunk.forEach((p, j) => cache.set(keyOf(p), series[j]))
  }
}
