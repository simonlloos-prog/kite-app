import type { Map as MlMap } from 'maplibre-gl'
import { keyOf, loadPoints, windCache } from '../wind/cache'
import type { LatLon, WindSeries } from '../wind/openMeteo'
import { parisHourKey } from '../wind/time'
import { SPOTS } from '../spots/spots'

export type Snap = 'peek' | 'half' | 'full'

class AppState {
  center = $state<LatLon>({ lat: 44.68, lon: -1.17 })
  target = $state.raw<WindSeries | null>(null)
  targetLoading = $state(false)
  targetError = $state<string | null>(null)
  selectedTime = $state(parisHourKey())
  snap = $state<Snap>('peek')
  /** Bottom padding of the map, i.e. the sheet height that covers it. */
  mapPadBottom = $state(0)
  layers = $state({ values: true, arrows: true, spots: true })
  /** Bumped after each cache fill: windCache itself is not reactive. */
  cacheVersion = $state(0)
  online = $state(navigator.onLine)

  /** Plain property: the map instance must never be proxied. */
  map: MlMap | null = null
  private targetAbort: AbortController | null = null

  async setCenter(p: LatLon) {
    this.center = p
    const key = keyOf(p)
    const hit = windCache.get(key)
    if (hit) {
      this.target = hit
      this.targetError = null
      return
    }
    this.targetAbort?.abort()
    const ac = new AbortController()
    this.targetAbort = ac
    this.targetLoading = true
    try {
      await loadPoints([p], ac.signal)
      this.target = windCache.get(key) ?? null
      this.targetError = null
      this.cacheVersion++
    } catch (e) {
      if (!ac.signal.aborted) this.targetError = e instanceof Error ? e.message : String(e)
    } finally {
      if (this.targetAbort === ac) this.targetLoading = false
    }
  }

  async loadSpots() {
    try {
      await loadPoints(SPOTS)
      this.cacheVersion++
    } catch (e) {
      console.warn('spots', e)
    }
  }

  flyTo(p: LatLon) {
    const map = this.map
    if (!map) return
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
