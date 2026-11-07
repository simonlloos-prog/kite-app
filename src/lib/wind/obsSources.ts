/**
 * Live wind at the stations, read from each source: the Cloudflare Worker (worker/index.ts)
 * runs this on demand. Same sources and rules as pipeline/fetch_obs.py, which still writes a
 * fallback copy into meta.json.
 */
import type { Obs } from './obs'

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

const HOLFUY = (id: string) => `https://holfuy.com/dynamic/graphs/tdarr${id}.js`
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
  Average: Record<string, { wspeed: number; wdir: number; gmax: number }>
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

/**
 * The file Holfuy's station page draws its graphs from: `var unt = ['2026/11/07 17:08:58', ...];
 * var gd_speed = [5, ...]; ...`. Not an API: it may change, and the beacon then goes missing.
 * Every 2 min, km/h as integers, Paris local time. Last 10 minutes: mean speed, max gust, mean
 * direction weighted by speed (350° and 10° average to north, not south).
 */
export function fromHolfuy(id: string, js: string): Obs | null {
  const arrays: Record<string, string[]> = {}
  for (const [, name, body] of js.matchAll(/var\s+(\w+)\s*=\s*\[(.*?)\];/gs)) {
    arrays[name] = body.split(',').map((x) => x.trim().replace(/^'|'$/g, ''))
  }
  const { unt, gd_speed, gd_gust, gd_direction } = arrays
  if (!unt?.length || [gd_speed, gd_gust, gd_direction].some((a) => a?.length !== unt.length)) return null
  const times = unt.map((t) => {
    const [y, mo, d, h, mi, s] = t.split(/[/ :]/).map(Number)
    return parisToUtc(y, mo, d, h, mi, s).getTime()
  })
  const last = times.flatMap((t, i) => (t > times.at(-1)! - 10 * 60_000 ? [i] : []))
  const speed = last.map((i) => Number(gd_speed[i]))
  const dirs = last.map((i) => Number(gd_direction[i]))
  const u = speed.reduce((a, s, k) => a + s * Math.sin((dirs[k] * Math.PI) / 180), 0)
  const v = speed.reduce((a, s, k) => a + s * Math.cos((dirs[k] * Math.PI) / 180), 0)
  const [name, lat, lon] = HOLFUY_BEACONS[id]
  return {
    id: `holfuy-${id}`,
    name,
    source: 'Holfuy',
    lat,
    lon,
    time: new Date(times.at(-1)!).toISOString().replace(/\.\d+Z$/, 'Z'),
    speed: round1((speed.reduce((a, b) => a + b, 0) / speed.length) * KMH_TO_KN),
    dir: u || v ? Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360) : dirs.at(-1)!,
    gust: round1(Math.max(...last.map((i) => Number(gd_gust[i]))) * KMH_TO_KN),
  }
}

/** Every station at once; a source that fails is just missing. */
export async function fetchAllObs(meteoFranceKey: string): Promise<Obs[]> {
  const get = async <T>(url: string, init: RequestInit, read: (r: Response) => Promise<T>): Promise<T | null> => {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
      return r.ok ? await read(r) : null
    } catch {
      return null
    }
  }
  const ua = { 'User-Agent': 'kite-app (simonlloos-prog.github.io/kite-app)' }
  const tasks: Promise<Obs | null>[] = [
    ...Object.keys(MF_STATIONS).map(async (id) =>
      meteoFranceKey
        ? fromMeteoFrance(id, (await get(METEO_FRANCE + id, { headers: { apikey: meteoFranceKey } }, (r) => r.json() as Promise<MeteoFranceRecord[]>))?.[0])
        : null,
    ),
    ...Object.keys(WEAMETER_STATIONS).map(async (slug) => {
      // Weameter only answers compressed requests (406 otherwise); fetch decompresses.
      const d = await get(WEAMETER(slug), { headers: { ...ua, 'Accept-Encoding': 'gzip' } }, (r) => r.json() as Promise<WeameterLive>)
      return d ? fromWeameter(slug, d) : null
    }),
    ...Object.keys(HOLFUY_BEACONS).map(async (id) => {
      const js = await get(HOLFUY(id), { headers: ua }, (r) => r.text())
      return js ? fromHolfuy(id, js) : null
    }),
  ]
  return (await Promise.all(tasks.map((t) => t.catch(() => null)))).filter((o): o is Obs => o !== null)
}
