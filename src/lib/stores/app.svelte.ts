import type { Map as MlMap } from 'maplibre-gl'
import { cellOf, decodeHour, windAt, type Hour, type LatLon, type Meta, type WindAt } from '../wind/arome'
import { checkForUpdate } from '../pwa'
import { decodePi, gustTrend, type GustTrend } from '../wind/pi'
import type { Bounds, Kind } from '../wind/field'
import { tideByTime, type Tide } from '../wind/tide'
import { parisHourKey } from '../wind/time'
import type { Unit } from '../wind/units'

/** Spots sheet position. Closed by default: the time dial lives on its own. */
export type Snap = 'closed' | 'half' | 'full'

export interface Picked extends LatLon {
  name?: string
  /** A spot's wind point, out on the water. */
  windPoint?: LatLon
}

const DATA_URL = `${import.meta.env.BASE_URL}data/`
const PREFS_KEY = 'kite-prefs'

/** Per-phone preferences. Storage may be unavailable (private mode): fall back to defaults. */
function loadPrefs(): { unit?: Unit } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const prefs = loadPrefs()

/**
 * A data file, re-fetched past the cache when its size is wrong. The service worker keeps
 * hour files forever, so a file republished under the same name with another grid would
 * otherwise stay stale: the query string gives a cache key it has never seen.
 */
async function fetchBin(url: string, bytes: number): Promise<ArrayBuffer> {
  for (const u of [url, `${url}?fresh=${Date.now()}`]) {
    const res = await fetch(u)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength === bytes) return buf
  }
  throw new Error(`taille inattendue (${bytes} octets attendus)`)
}

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
  /** Bottom padding of the map: what the open spots sheet covers. */
  mapPadBottom = $state(0)
  layers = $state({ field: true, values: true, arrows: true, spots: true })
  unit = $state<Unit>(prefs.unit ?? 'kn')
  zoom = $state(11)
  bounds = $state.raw<Bounds | null>(null)
  /** Run time (ISO UTC) of the AROME-PI gusts loaded, if any. */
  piRun = $state.raw<string | null>(null)
  /** Bumped when an hour or the AROME-PI gusts arrive: the decoded arrays are not reactive. */
  dataVersion = $state(0)
  online = $state(navigator.onLine)
  refreshing = $state(false)
  /** Hidden screen diagnostics (long press on ⟳). */
  showDiagnostics = $state(false)

  /** Plain properties: the map instance and the decoded arrays must never be proxied. */
  map: MlMap | null = null
  private hours = new Map<string, Hour>()
  private fileOf = new Map<string, string>()
  /** AROME-PI gusts per Paris hour key. */
  private pi = new Map<string, Float32Array>()
  /** Tide at the Bassin inlet per Paris hour key. */
  private tides = new Map<string, Tide>()

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

  savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ unit: this.unit }))
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }

  /** Decoded data of the selected hour, once downloaded. */
  get hour(): Hour | undefined {
    void this.dataVersion
    return this.hours.get(this.selectedTime)
  }

  /** Tide in the Bassin at the selected hour, when known. */
  get tide(): Tide | null {
    void this.dataVersion
    return this.tides.get(this.selectedTime) ?? null
  }

  windAt(p: LatLon): WindAt | null {
    return this.meta ? windAt(this.meta.grid, this.hour, p) : null
  }

  /** AROME-PI gust at a point for the selected hour, null outside its 6 hours. */
  piGustAt(p: LatLon): number | null {
    void this.dataVersion
    const gusts = this.pi.get(this.selectedTime)
    const k = gusts && this.meta ? cellOf(this.meta.grid, p) : null
    return k === null ? null : gusts![k]
  }

  /** AROME-PI against AROME gusts at a point, over the hours both cover. */
  gustTrendAt(p: LatLon): GustTrend | null {
    void this.dataVersion
    const k = this.meta ? cellOf(this.meta.grid, p) : null
    if (k === null) return null
    return gustTrend([...this.pi].map(([key, gusts]) => [this.hours.get(key)?.gust[k] ?? NaN, gusts[k]]))
  }

  private async loadPi(meta: Meta) {
    const pi = meta.pi!
    const n = meta.grid.rows * meta.grid.cols
    try {
      const buf = await fetchBin(DATA_URL + pi.file, pi.times.length * n)
      const hours = decodePi(buf, meta.grid, pi.times.length, meta.scale)
      this.pi = new Map(pi.times.map((t, i) => [parisHourKey(new Date(t)), hours[i]]))
      this.piRun = pi.run
      this.dataVersion++
    } catch {
      // Optional: without it, spots simply show no AROME-PI trend.
    }
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
    this.error = null
    // AROME-PI runs every hour, AROME every 3 h: refresh it even when the AROME run is the same.
    if (meta.pi && meta.pi.run !== this.piRun) this.loadPi(meta)
    const tides = meta.tide ? tideByTime(meta.tide) : new Map<string, Tide>()
    this.tides = new Map([...tides].map(([t, tide]) => [parisHourKey(new Date(t)), tide]))
    this.dataVersion++
    // File names carry the run and a grid fingerprint: same first file, same data.
    if (meta.files[0] === this.meta?.files[0]) return

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
        const buf = await fetchBin(DATA_URL + this.fileOf.get(key), 3 * meta.grid.rows * meta.grid.cols)
        this.hours.set(key, decodeHour(buf, meta.grid, meta.scale))
        this.loaded++
        this.dataVersion++
      } catch (e) {
        this.error = `heure ${key} : ${e instanceof Error ? e.message : e}`
      }
      // A newer run arrived meanwhile: that call takes over.
      if (this.meta !== meta) return
    }
  }

  /** ⟳ button and return to the app: newer app version, then newer data. */
  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      await checkForUpdate()
      await this.loadData()
    } finally {
      this.refreshing = false
    }
  }

  /** Paris hour keys compared by the AROME-PI badges: hours both runs cover. */
  get piHours(): string[] {
    void this.dataVersion
    return [...this.pi.keys()].filter((k) => this.hours.has(k)).sort()
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
// Back to the app after a while: pick up a newer app version and a newer run if there is one.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') app.refresh()
})
