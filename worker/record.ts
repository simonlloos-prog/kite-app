/**
 * History of the stations whose source only gives its latest reading (Météo-France) or rolling
 * averages (Weameter): the Worker's 5-minute task records them in R2 itself, for the card shown
 * when a station is tapped. Holfuy keeps its own history and is not recorded.
 *
 * Stored compact, one row per reading: [time (s), speed ×10 (kn), gust ×10 (kn), direction (°)].
 */
import type { Obs, ObsPoint } from '../src/lib/wind/obs'

/** Outside data/, which the old-runs lifecycle rule empties. */
export const RECORD_KEY = 'state/obs-history.json'
/** As long as the card's longest view. */
export const KEEP_MS = 8 * 3_600_000
/** Minutes per bar on the card: readings come every 5 to 10 min, shorter bars would leave gaps. */
export const RECORD_STEP = 10

export type Recorded = Record<string, [number, number, number, number][]>

/** The store with these readings added (one per station and time, oldest first) and those older than KEEP_MS dropped. */
export function addReadings(store: Recorded, obs: Obs[], now: number): Recorded {
  const since = (now - KEEP_MS) / 1000
  const out: Recorded = {}
  for (const [id, rows] of Object.entries(store)) {
    const kept = rows.filter((r) => r[0] >= since)
    if (kept.length) out[id] = kept
  }
  for (const o of obs) {
    const t = Math.round(Date.parse(o.time) / 1000)
    if (!(t >= since)) continue
    const rows = (out[o.id] ??= [])
    if (rows.length && rows[rows.length - 1][0] >= t) continue // Same reading as last time.
    rows.push([t, Math.round(o.speed * 10), Math.round((o.gust ?? o.speed) * 10), o.dir])
  }
  return out
}

/** A station's recorded readings, oldest first. Without a gust, it is the mean speed. */
export const pointsOf = (store: Recorded, id: string): ObsPoint[] =>
  (store[id] ?? []).map(([t, speed, gust, dir]) => ({ t: t * 1000, speed: speed / 10, gust: gust / 10, dir }))
