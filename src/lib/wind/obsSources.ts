/**
 * Live wind at the stations, read from each source: the Cloudflare Worker (worker/index.ts)
 * runs this on demand. Same sources and rules as pipeline/fetch_obs.py, which still writes a
 * fallback copy into meta.json.
 */
import type { Obs, ObsHistory, ObsPoint, ObsWindow } from './obs'

const MS_TO_KN = 3600 / 1852
const KMH_TO_KN = 1 / 1.852

const METEO_FRANCE = 'https://public-api.meteofrance.fr/public/DPObs/v1/station/infrahoraire-6m?format=json&id_station='
/** Météo-France station id → short name (ids from the API's liste-stations). */
export const MF_STATIONS: Record<string, string> = {
  '33236002': 'Cap Ferret',
  '33529001': 'Cazaux',
  '40046001': 'Biscarrosse',
  '33540001': 'Vendays-Montalivet',
  '17306004': 'Royan',
  '40065002': 'Capbreton',
}

const WEAMETER = (slug: string) => `https://weameter.com/stations/${slug}/windrtv2.json`
/** Weameter slug → name and position (from its page: not in the live file). Weameter agreed. */
export const WEAMETER_STATIONS: Record<string, [string, number, number]> = {
  andernos: ['Andernos', 44.744, -1.102],
  lachanau: ['Lachanau', 45.165, -1.076],
}

/**
 * The query string gives each request its own cache key: Cloudflare caches the .js files a Worker
 * fetches, and the readings then came 30 min to 1 h 40 late although the file itself was fresh.
 */
const HOLFUY = (id: string) => `https://holfuy.com/dynamic/graphs/tdarr${id}.js?t=${Date.now()}`
/** Holfuy beacon id → name and position (from its page's map link). Their owners agreed. */
export const HOLFUY_BEACONS: Record<string, [string, number, number]> = {
  '1995': ['CVA', 44.660952, -1.144144],
  '1383': ['Les Arbousiers', 44.64617, -1.19999],
  '1491': ['La Hume', 44.64542, -1.11327],
  '1317': ['La Jenny', 44.8566, -1.21987],
}

const round1 = (x: number) => Math.round(x * 10) / 10

interface MeteoFranceRecord {
  lat: number
  lon: number
  validity_time: string
  ff: number | null
  dd: number | null
  fxi10?: number | null
}

/** Last 6-minute record of a Météo-France station, null without wind. */
export function fromMeteoFrance(id: string, r: MeteoFranceRecord | undefined): Obs | null {
  if (!r || r.ff == null || r.dd == null) return null
  const o: Obs = { id, name: MF_STATIONS[id], source: 'Météo-France', lat: r.lat, lon: r.lon, time: r.validity_time, speed: round1(r.ff * MS_TO_KN), dir: r.dd }
  if (r.fxi10 != null) o.gust = round1(r.fxi10 * MS_TO_KN)
  return o
}

interface WeameterLive {
  current: { epoch: number }
  Average: Record<string, { wspeed: number; wdir: number; gmax: number; Txt?: string }>
}

/** Weameter's live file: knots; Average["0"] is the last 10 minutes (the instant wind is too jumpy). */
export function fromWeameter(slug: string, d: WeameterLive): Obs {
  const [name, lat, lon] = WEAMETER_STATIONS[slug]
  const last10 = d.Average['0']
  return {
    id: `weameter-${slug}`,
    name,
    source: 'Weameter',
    lat,
    lon,
    time: new Date(d.current.epoch * 1000).toISOString().replace(/\.\d+Z$/, 'Z'),
    speed: round1(last10.wspeed),
    dir: last10.wdir,
    gust: round1(last10.gmax),
  }
}

/** Last Sunday of a month, 01:00 UTC: when Europe switches summer time. */
function lastSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0, 1))
  return d.getTime() - d.getUTCDay() * 86_400_000
}

/** Paris local time → UTC, by the EU rule (summer time from the last Sunday of March to the last of October). */
export function parisToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  const summer = (t: number) => t >= lastSunday(y, 2) && t < lastSunday(y, 9)
  return new Date(summer(asUtc - 2 * 3_600_000) ? asUtc - 2 * 3_600_000 : asUtc - 3_600_000)
}

/** Mean direction weighted by speed (350° and 10° average to north, not south). */
export function meanDir(points: { speed: number; dir: number }[]): number {
  const u = points.reduce((a, p) => a + p.speed * Math.sin((p.dir * Math.PI) / 180), 0)
  const v = points.reduce((a, p) => a + p.speed * Math.cos((p.dir * Math.PI) / 180), 0)
  return u || v ? Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360) : points.at(-1)!.dir
}

/** What a Holfuy beacon shows: its last 10 minutes (mean speed, max gust, mean direction), oldest point first. */
export function summarize(id: string, points: ObsPoint[]): Obs {
  const end = points.at(-1)!.t
  const last = points.filter((p) => p.t > end - 10 * 60_000)
  const [name, lat, lon] = HOLFUY_BEACONS[id]
  return {
    id: `holfuy-${id}`,
    name,
    source: 'Holfuy',
    lat,
    lon,
    time: new Date(end).toISOString().replace(/\.\d+Z$/, 'Z'),
    speed: round1(last.reduce((a, p) => a + p.speed, 0) / last.length),
    dir: meanDir(last),
    gust: round1(Math.max(...last.map((p) => p.gust))),
  }
}

/**
 * The file Holfuy's station page draws its graphs from: `var unt = ['2026/11/07 17:08:58', ...];
 * var gd_speed = [5, ...]; ...`. Not an API: it may change, and the beacon then goes missing.
 * About 5 days, km/h as integers, Paris local time; rewritten only every few minutes.
 */
export function tdarrPoints(js: string): ObsPoint[] | null {
  const arrays: Record<string, string[]> = {}
  for (const [, name, body] of js.matchAll(/var\s+(\w+)\s*=\s*\[(.*?)\];/gs)) {
    arrays[name] = body.split(',').map((x) => x.trim().replace(/^'|'$/g, ''))
  }
  const { unt, gd_speed, gd_gust, gd_direction } = arrays
  if (!unt?.length || [gd_speed, gd_gust, gd_direction].some((a) => a?.length !== unt.length)) return null
  return unt.map((u, i) => {
    const [y, mo, d, h, mi, s] = u.split(/[/ :]/).map(Number)
    return { t: parisToUtc(y, mo, d, h, mi, s).getTime(), speed: Number(gd_speed[i]) * KMH_TO_KN, gust: Number(gd_gust[i]) * KMH_TO_KN, dir: Number(gd_direction[i]) }
  })
}

export function fromHolfuy(id: string, js: string): Obs | null {
  const points = tdarrPoints(js)
  return points && summarize(id, points)
}

const HOLFUY_ARCHIVE = (id: string, key: string, minutes: number) =>
  `https://api.holfuy.com/archive/?s=${id}&pw=${encodeURIComponent(key)}&mback=${minutes}&type=0&su=knots&tu=C&m=JSON&utc`

interface HolfuyArchive {
  measurements?: { dateTime: string; wind: { speed: number; gust: number; direction: number } }[]
}

/**
 * Holfuy's archive API, for the beacons whose owner gave a key: every reading of the last minutes,
 * the newest a few seconds old. Knots, UTC. Null on an error answer ("no_access"…), sent with HTTP 200.
 */
export function archivePoints(d: HolfuyArchive): ObsPoint[] | null {
  if (!d.measurements?.length) return null
  return d.measurements
    .map((m) => ({ t: Date.parse(`${m.dateTime.replace(' ', 'T')}Z`), speed: m.wind.speed, gust: m.wind.gust, dir: m.wind.direction }))
    .sort((a, b) => a.t - b.t)
}

const ua = { 'User-Agent': 'kite-app (simonlloos-prog.github.io/kite-app)' }

async function get<T>(url: string, init: RequestInit, read: (r: Response) => Promise<T>): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
    return r.ok ? await read(r) : null
  } catch {
    return null
  }
}

type HolfuyKeys = Record<string, string | undefined>

/** A Holfuy beacon's readings: the archive API when it has a key, else (and as a fallback) its graph file. */
async function holfuyPoints(id: string, keys: HolfuyKeys, minutes: number): Promise<ObsPoint[] | null> {
  const key = keys[id]
  const archive = key ? await get(HOLFUY_ARCHIVE(id, key, minutes), { headers: ua }, (r) => r.json() as Promise<HolfuyArchive>) : null
  const points = archive && archivePoints(archive)
  if (points) return points
  const js = await get(HOLFUY(id), { headers: ua }, (r) => r.text())
  return js ? tdarrPoints(js) : null
}

const WEAMETER_HEADERS = { ...ua, 'Accept-Encoding': 'gzip' }
const WEAMETER_WINDOWS = ["10'", "30'", '1h', '2h', '4h']
/** Is this one of our stations? */
export const isStation = (id: string) =>
  id in MF_STATIONS || WEAMETER_STATIONS[id.replace('weameter-', '')] !== undefined || HOLFUY_BEACONS[id.replace('holfuy-', '')] !== undefined

/**
 * What a station's source gives of its recent past: 8 hours of readings (Holfuy, the archive API's
 * maximum), its rolling averages (Weameter), or nothing (Météo-France). The Worker adds what it
 * recorded itself for the last two (worker/record.ts).
 */
export async function fetchHistory(id: string, holfuyKeys: HolfuyKeys = {}): Promise<ObsHistory> {
  let points: ObsPoint[] = []
  let windows: ObsWindow[] = []
  if (id.startsWith('holfuy-')) {
    const all = (await holfuyPoints(id.slice('holfuy-'.length), holfuyKeys, 480)) ?? []
    const end = all.at(-1)?.t ?? 0
    points = all.filter((p) => p.t >= end - 8 * 3_600_000)
  } else if (id.startsWith('weameter-')) {
    const d = await get(WEAMETER(id.slice('weameter-'.length)), { headers: WEAMETER_HEADERS }, (r) => r.json() as Promise<WeameterLive>)
    windows = Object.values(d?.Average ?? {})
      .filter((a) => a.Txt && WEAMETER_WINDOWS.includes(a.Txt))
      .map((a) => ({ label: a.Txt!, speed: round1(a.wspeed), gust: round1(a.gmax), dir: a.wdir }))
  }
  return { id, points, windows }
}

/** Stations without a history of their own: the Worker records them (worker/record.ts). */
export const isRecorded = (id: string) => id in MF_STATIONS || id.startsWith('weameter-')

const settle = async (tasks: Promise<Obs | null>[]): Promise<Obs[]> =>
  (await Promise.all(tasks.map((t) => t.catch(() => null)))).filter((o): o is Obs => o !== null)

const meteoFranceTasks = (key: string) =>
  Object.keys(MF_STATIONS).map(async (id) =>
    key ? fromMeteoFrance(id, (await get(METEO_FRANCE + id, { headers: { apikey: key } }, (r) => r.json() as Promise<MeteoFranceRecord[]>))?.[0]) : null,
  )

const weameterTasks = () =>
  Object.keys(WEAMETER_STATIONS).map(async (slug) => {
    // Weameter only answers compressed requests (406 otherwise); fetch decompresses.
    const d = await get(WEAMETER(slug), { headers: WEAMETER_HEADERS }, (r) => r.json() as Promise<WeameterLive>)
    return d ? fromWeameter(slug, d) : null
  })

/** The stations the Worker records: Météo-France and Weameter. */
export const fetchRecordedObs = (meteoFranceKey: string): Promise<Obs[]> => settle([...meteoFranceTasks(meteoFranceKey), ...weameterTasks()])

/** Every station at once; a source that fails is just missing. `holfuyKeys`: beacon id → API key, when there is one. */
export function fetchAllObs(meteoFranceKey: string, holfuyKeys: HolfuyKeys = {}): Promise<Obs[]> {
  return settle([
    ...meteoFranceTasks(meteoFranceKey),
    ...weameterTasks(),
    ...Object.keys(HOLFUY_BEACONS).map(async (id) => {
      const points = await holfuyPoints(id, holfuyKeys, 12)
      return points && summarize(id, points)
    }),
  ])
}
