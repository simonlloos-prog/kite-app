import type { Map as MlMap } from 'maplibre-gl'
import { keyOf, loadPoints, windCache } from '../wind/cache'
import { domainPoints, nearestNode } from '../wind/domain'
import type { Kind } from '../wind/field'
import type { LatLon, WindSeries } from '../wind/openMeteo'
import { parisHourKey } from '../wind/time'
import { SPOTS } from '../spots/spots'

export type Snap = 'peek' | 'half' | 'full'

export interface Picked extends LatLon {
  name?: string
}

const STORAGE_KEY = 'wind-cache-v1'

class AppState {
  /** Forecast hours from the current one onwards. */
  times = $state.raw<string[]>([])
  selectedTime = $state(parisHourKey())
  loading = $state(false)
  error = $state<string | null>(null)
  kind = $state<Kind>('speed')
  picked = $state<Picked | null>(null)
  snap = $state<Snap>('peek')
  /** Bottom padding of the map, i.e. the sheet height that covers it. */
  mapPadBottom = $state(0)
  layers = $state({ field: true, values: true, arrows: true, spots: true })
  /** Bumped after each cache fill: windCache itself is not reactive. */
  cacheVersion = $state(0)
  online = $state(navigator.onLine)

  /** Plain property: the map instance must never be proxied. */
  map: MlMap | null = null

  get timeIndex() {
    return this.times.indexOf(this.selectedTime)
  }

  setTimeIndex(i: number) {
    const t = this.times[Math.max(0, Math.min(this.times.length - 1, i))]
    if (t && t !== this.selectedTime) this.selectedTime = t
  }

  stepTime(n: number) {
    this.setTimeIndex(this.timeIndex + n)
  }

  /** Domain grid + spots, every hour at once. Only stale or missing points are fetched. */
  async loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) windCache.restore(saved)
    } catch {
      // Private mode or corrupted entry: start from an empty cache.
    }
    this.loading = true
    try {
      await loadPoints([...domainPoints(), ...SPOTS])
      this.error = null
      try {
        localStorage.setItem(STORAGE_KEY, windCache.serialize())
      } catch {
        // Quota or private mode: the in-memory cache still works.
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.loading = false
    }
    const now = parisHourKey()
    this.times = windCache.get(keyOf(SPOTS[0]))?.times.filter((t) => t >= now) ?? []
    if (!this.times.includes(this.selectedTime)) this.selectedTime = this.times[0] ?? now
    this.cacheVersion++
  }

  /** Series under the picked point: the spot's own, or the nearest grid node. */
  seriesAt(p: Picked): WindSeries | undefined {
    const spot = SPOTS.find((s) => s.name === p.name)
    const node = spot ?? nearestNode(p)
    return node ? windCache.get(keyOf(node)) : undefined
  }

  flyTo(p: Picked) {
    const map = this.map
    if (!map) return
    this.picked = p
    const fly = () => map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5) })
    if (this.snap === 'peek') return fly()
    // Wait for the padding ease triggered by the snap change, or it would cancel the flight.
    this.snap = 'peek'
    map.once('moveend', fly)
  }
}

export const app = new AppState()

addEventListener('online', () => (app.online = true))
addEventListener('offline', () => (app.online = false))
// Back to the app after a while: refresh what has gone stale.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') app.loadData()
})
