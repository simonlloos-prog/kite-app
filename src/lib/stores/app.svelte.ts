import type { Map as MlMap } from 'maplibre-gl'
import { cellOf, decodeHour, windAt, type Hour, type LatLon, type Meta, type WindAt } from '../wind/arome'
import { checkForUpdate } from '../pwa'
import { freshObs, mergeObs, type Obs, type ObsHistory } from '../wind/obs'
import { decodePi, gustTrend, type GustTrend } from '../wind/pi'
import type { Bounds, Kind } from '../wind/field'
import { tideByTime, type Tide } from '../wind/tide'
import { checkWave, waveAt, waveField, type WaveAt, type WaveField, type WaveMeta } from '../wind/wave'
import { parisHourKey } from '../wind/time'
import type { Unit } from '../wind/units'

/** Spots sheet position. Closed by default: the time dial lives on its own. */
export type Snap = 'closed' | 'half' | 'full'

export interface Picked extends LatLon {
  name?: string
  /** A spot's area: ocean beaches show waves. */
  area?: string
  /** A spot's wind point, out on the water. */
  windPoint?: LatLon
  /** A Météo-France station: its measured wind. */
  obs?: Obs
}

/** Forecast files: R2 through the Worker in production (VITE_DATA_URL), public/data in development. */
const DATA_URL: string = import.meta.env.VITE_DATA_URL ?? `${import.meta.env.BASE_URL}data/`
/** Live station readings (Cloudflare Worker, worker/index.ts); unset: meta.json's copy only. */
const OBS_URL: string | undefined = import.meta.env.VITE_OBS_URL
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
  /** The map shows the waves (MFWAM) instead of the wind. */
  waves = $state(false)
  picked = $state<Picked | null>(null)
  snap = $state<Snap>('closed')
  /** Bottom padding of the map: what the open spots sheet covers. */
  mapPadBottom = $state(0)
  layers = $state({ field: true, values: true, arrows: true, spots: true, obs: true })
  unit = $state<Unit>(prefs.unit ?? 'kn')
  zoom = $state(11)
  bounds = $state.raw<Bounds | null>(null)
  /** Run time (ISO UTC) of the AROME-PI gusts loaded, if any. */
  piRun = $state.raw<string | null>(null)
  /** Bumped when an hour or the AROME-PI gusts arrive: the decoded arrays are not reactive. */
  dataVersion = $state(0)
  online = $state(navigator.onLine)
  refreshing = $state(false)
  /** What the tapped station measured lately. */
  obsHistory = $state.raw<ObsHistory | null>(null)
  /** Hidden screen diagnostics (long press on ⟳). */
  showDiagnostics = $state(false)

  /** Station records from meta.json (rebuilt every 15 min) and from the Worker (live), fresh or not. */
  private metaObs = $state.raw<Obs[]>([])
  private liveObs = $state.raw<Obs[]>([])

  /** Plain properties: the map instance and the decoded arrays must never be proxied. */
  map: MlMap | null = null
  private hours = new Map<string, Hour>()
  private fileOf = new Map<string, string>()
  /** File each decoded hour came from: while a run comes out, the file of an hour changes. */
  private hourFiles = new Map<string, string>()
  /** AROME-PI gusts per Paris hour key. */
  private pi = new Map<string, Float32Array>()
  /** Tide at the Bassin inlet per Paris hour key. */
  private tides = new Map<string, Tide>()
  /** MFWAM waves: the run loaded, its file, and the hour index of each Paris hour key. */
  private wave: { meta: WaveMeta; data: Uint8Array; hourOf: Map<string, number> } | null = null
  /** Map fields of the wave hours already drawn, per hour index of the loaded run. */
  private waveFields = new Map<number, WaveField>()

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

  /** File of the hour on screen: what it shows may still be the previous run's. */
  get hourFile(): string | undefined {
    void this.dataVersion
    return this.hourFiles.get(this.selectedTime)
  }

  /** Tide in the Bassin at the selected hour, when known. */
  get tide(): Tide | null {
    void this.dataVersion
    return this.tides.get(this.selectedTime) ?? null
  }

  /** Latest measured wind at the stations, whatever the hour shown. */
  get obs(): Obs[] {
    void this.dataVersion
    return freshObs(mergeObs(this.liveObs, this.metaObs))
  }

  /** The hour shown is now: measurements compare with it. On later hours they are only greyed hints. */
  get obsLive(): boolean {
    return this.timeIndex === 0
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

  /** Waves at the sea cell nearest to a point for the selected hour; null on land or outside the run. */
  waveAt(p: LatLon): WaveAt | null {
    void this.dataVersion
    const h = this.wave?.hourOf.get(this.selectedTime)
    return h === undefined ? null : waveAt(this.wave!.meta, this.wave!.data, h, p)
  }

  /** Wave map of the selected hour: its run, grid and fields; null outside the run or before it loads. */
  get waveMap(): { meta: WaveMeta; time: string; field: WaveField } | null {
    void this.dataVersion
    const h = this.wave?.hourOf.get(this.selectedTime)
    if (h === undefined) return null
    let field = this.waveFields.get(h)
    if (!field) {
      field = waveField(this.wave!.meta, this.wave!.data, h)
      this.waveFields.set(h, field)
    }
    return { meta: this.wave!.meta, time: this.selectedTime, field }
  }

  private async loadWave(wave: WaveMeta) {
    const { rows, cols } = wave.grid
    try {
      const buf = await fetchBin(DATA_URL + wave.file, wave.times.length * wave.fields.length * rows * cols)
      const hourOf = new Map(wave.times.map((t, i) => [parisHourKey(new Date(t)), i]))
      this.wave = { meta: wave, data: checkWave(buf, wave), hourOf }
      this.waveFields.clear()
      this.dataVersion++
    } catch {
      // Optional: without it, ocean spots simply show no waves.
    }
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

  /**
   * Latest data: the selected hour first, then the others in order. Only the hours whose file
   * changed are fetched, and an hour keeps showing its previous file until the new one is there.
   */
  async loadData() {
    // First, even offline or when the run has not changed: the app may come back hours later.
    this.dropPastHours()
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
    // Waves: a new run every 6 h, on their own grid.
    if (meta.wave && meta.wave.file !== this.wave?.meta.file) this.loadWave(meta.wave)
    const tides = meta.tide ? tideByTime(meta.tide) : new Map<string, Tide>()
    this.tides = new Map([...tides].map(([t, tide]) => [parisHourKey(new Date(t)), tide]))
    this.metaObs = meta.obs ?? []
    this.loadObs()
    this.dataVersion++
    // File names carry the run and a grid fingerprint: same files, same data.
    if (meta.files.join() === this.meta?.files.join()) return

    const now = parisHourKey()
    const keys = meta.times.map((t) => parisHourKey(new Date(t)))
    const fileOf = new Map(keys.map((k, i) => [k, meta.files[i]]))
    if (JSON.stringify(meta.grid) !== JSON.stringify(this.meta?.grid)) {
      this.hours.clear()
      this.hourFiles.clear()
    }
    for (const k of this.hours.keys()) {
      if (!fileOf.has(k)) {
        this.hours.delete(k)
        this.hourFiles.delete(k)
      }
    }
    this.fileOf = fileOf
    this.meta = meta
    this.times = keys.filter((k) => k >= now)
    if (!this.times.includes(this.selectedTime)) this.selectedTime = this.times[0] ?? now
    const toFetch = (k: string) => this.hourFiles.get(k) !== fileOf.get(k)
    this.loaded = this.times.filter((k) => !toFetch(k)).length

    const order = [this.selectedTime, ...this.times.filter((t) => t !== this.selectedTime)].filter(toFetch)
    for (const key of order) {
      const file = fileOf.get(key)!
      try {
        const buf = await fetchBin(DATA_URL + file, 3 * meta.grid.rows * meta.grid.cols)
        // Newer data arrived meanwhile: that call takes over.
        if (this.meta !== meta) return
        this.hours.set(key, decodeHour(buf, meta.grid, meta.scale))
        this.hourFiles.set(key, file)
        this.loaded++
        this.dataVersion++
      } catch (e) {
        if (this.meta !== meta) return
        this.error = `heure ${key} : ${e instanceof Error ? e.message : e}`
      }
    }
  }

  /** Removes the hours already past from the dial; a past selected hour moves to now. */
  dropPastHours() {
    const now = parisHourKey()
    if (!this.times.length || this.times[0] >= now) return
    this.times = this.times.filter((k) => k >= now)
    if (!this.times.includes(this.selectedTime)) this.selectedTime = this.times[0] ?? now
    this.loaded = this.times.filter((k) => this.hourFiles.get(k) === this.fileOf.get(k)).length
  }

  /** Live readings from the Worker: seconds old, where meta.json's are 10 to 35 minutes old. */
  async loadObs() {
    if (!OBS_URL) return
    try {
      const res = await fetch(OBS_URL, { cache: 'no-store' })
      if (res.ok) this.liveObs = (await res.json()).obs ?? []
    } catch {
      // Offline or Worker down: meta.json's copy stays.
    }
  }

  async loadHistory(id: string) {
    if (!OBS_URL) return
    try {
      const res = await fetch(`${OBS_URL.replace(/obs$/, 'history')}?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (res.ok) this.obsHistory = await res.json()
    } catch {
      // Offline: the card shows the current reading only.
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

// While open: live readings every 30 s (the Worker keeps them 30 s), a newer run every 10 min.
setInterval(() => document.visibilityState === 'visible' && app.loadObs(), 30_000)
setInterval(() => document.visibilityState === 'visible' && app.loadData(), 10 * 60_000)
addEventListener('online', () => (app.online = true))
addEventListener('offline', () => (app.online = false))
// Back to the app after a while: pick up a newer app version and a newer run if there is one.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') app.refresh()
})
