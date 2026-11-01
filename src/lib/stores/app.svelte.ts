import type { Map as MlMap } from 'maplibre-gl'
import { decodeHour, windAt, type Hour, type LatLon, type Meta, type WindAt } from '../wind/arome'
import type { Bounds, Kind } from '../wind/field'
import { parisHourKey } from '../wind/time'

/** Spots sheet position. Closed by default: the time dial lives on its own. */
export type Snap = 'closed' | 'half' | 'full'

export interface Picked extends LatLon {
  name?: string
}

const DATA_URL = `${import.meta.env.BASE_URL}data/`

class AppState {
  meta = $state.raw<Meta | null>(null)
  /** Forecast hours from the current one onwards, as Paris hour keys. */
  times = $state.raw<string[]>([])
  selectedTime = $state(parisHourKey())
  /** Hours downloaded so far, out of `times.length`. */
  loaded = $state(0)
  error = $state<string | null>(null)
  kind = $state<Kind>('speed')
  picked = $state<Picked | null>(null)
  snap = $state<Snap>('closed')
  /** Bottom padding of the map: what the time dial or the sheet covers. */
  mapPadBottom = $state(0)
  layers = $state({ field: true, values: true, arrows: true, spots: true })
  zoom = $state(11)
  bounds = $state.raw<Bounds | null>(null)
  /** Bumped when an hour arrives: `hours` itself is not reactive. */
  dataVersion = $state(0)
  online = $state(navigator.onLine)

  /** Plain properties: the map instance and the decoded arrays must never be proxied. */
  map: MlMap | null = null
  private hours = new Map<string, Hour>()
  private fileOf = new Map<string, string>()

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

  /** Decoded data of the selected hour, once downloaded. */
  get hour(): Hour | undefined {
    void this.dataVersion
    return this.hours.get(this.selectedTime)
  }

  windAt(p: LatLon): WindAt | null {
    return this.meta ? windAt(this.meta.grid, this.hour, p) : null
  }

  /** Latest run: the selected hour first, then the others in order. */
  async loadData() {
    let meta: Meta
    try {
      const res = await fetch(`${DATA_URL}meta.json`, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`données AROME indisponibles (HTTP ${res.status})`)
      meta = await res.json()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      return
    }
    if (meta.run === this.meta?.run) return
    this.error = null

    const now = parisHourKey()
    const keys = meta.times.map((t) => parisHourKey(new Date(t)))
    this.hours.clear()
    this.fileOf = new Map(keys.map((k, i) => [k, meta.files[i]]))
    this.meta = meta
    this.times = keys.filter((k) => k >= now)
    if (!this.times.includes(this.selectedTime)) this.selectedTime = this.times[0] ?? now
    this.loaded = 0

    const order = [this.selectedTime, ...this.times.filter((t) => t !== this.selectedTime)]
    for (const key of order) {
      try {
        const res = await fetch(DATA_URL + this.fileOf.get(key))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.hours.set(key, decodeHour(await res.arrayBuffer(), meta.grid, meta.scale))
        this.loaded++
        this.dataVersion++
      } catch (e) {
        this.error = `heure ${key} : ${e instanceof Error ? e.message : e}`
      }
      // A newer run arrived meanwhile: that call takes over.
      if (this.meta !== meta) return
    }
  }

  flyTo(p: Picked) {
    const map = this.map
    if (!map) return
    this.picked = p
    const fly = () => map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5) })
    if (this.snap === 'closed') return fly()
    // Wait for the padding ease triggered by the snap change, or it would cancel the flight.
    this.snap = 'closed'
    map.once('moveend', fly)
  }
}

export const app = new AppState()

// Dev only: inspect and drive the app from the browser console.
if (import.meta.env.DEV) Object.assign(window, { app })

addEventListener('online', () => (app.online = true))
addEventListener('offline', () => (app.online = false))
// Back to the app after a while: pick up a newer run if there is one.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') app.loadData()
})
