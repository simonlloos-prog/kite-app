export interface LatLon {
  lat: number
  lon: number
}

/** Hourly wind series for one point. Missing values are NaN. */
export interface WindSeries {
  times: string[]
  speed: number[]
  gust: number[]
  dir: number[]
}

const BASE = 'https://api.open-meteo.com/v1/forecast'
export const MODEL = 'meteofrance_arome_france_hd'

export function buildUrl(points: LatLon[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    models: MODEL,
    wind_speed_unit: 'kn',
    timezone: 'Europe/Paris',
    // AROME HD stops after ~48 h: ask for 3 days and keep the hours that have data.
    forecast_days: '3',
  })
  return `${BASE}?${params}`
}

interface RawHourly {
  time: string[]
  wind_speed_10m: (number | null)[]
  wind_direction_10m: (number | null)[]
  wind_gusts_10m: (number | null)[]
}

const num = (v: number | null) => (v == null ? NaN : v)

/** Open-Meteo returns an object for one point and an array for several. */
export function parseResponse(json: unknown, count: number): WindSeries[] {
  const list = (Array.isArray(json) ? json : [json]) as { hourly?: RawHourly }[]
  if (list.length !== count) throw new Error(`Open-Meteo: ${list.length} points reçus, ${count} attendus`)
  return list.map(({ hourly: h }) => {
    if (!h) throw new Error('Open-Meteo: réponse sans données horaires')
    return {
      times: h.time,
      speed: h.wind_speed_10m.map(num),
      gust: h.wind_gusts_10m.map(num),
      dir: h.wind_direction_10m.map(num),
    }
  })
}

export async function fetchWind(points: LatLon[], signal?: AbortSignal): Promise<WindSeries[]> {
  const res = await fetch(buildUrl(points), { signal })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.reason ?? `Open-Meteo HTTP ${res.status}`)
  return parseResponse(json, points.length)
}

export interface WindAt {
  speed: number
  gust: number
  dir: number
}

export function valueAt(series: WindSeries | null | undefined, time: string): WindAt | null {
  if (!series) return null
  const i = series.times.indexOf(time)
  if (i < 0 || Number.isNaN(series.speed[i])) return null
  return { speed: series.speed[i], gust: series.gust[i], dir: series.dir[i] }
}
