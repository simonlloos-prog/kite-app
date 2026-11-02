const hourFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

/** Current hour in Europe/Paris as an Open-Meteo key: `YYYY-MM-DDTHH:00`. */
export const parisHourKey = (d = new Date()) => hourFmt.format(d).replace(' ', 'T') + ':00'

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })

/** `2026-11-01T14:00` → `dim. 14h` */
export function formatHour(key: string): string {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return `${dayFmt.format(Date.UTC(y, m - 1, d))} ${Number(key.slice(11, 13))}h`
}

/** A run is out about 4 h after its time and the next one 3 h later: past 8 h, at least one is missing. */
export const STALE_AFTER_H = 8

/** Hours since the run, when the published data missed at least one newer run; else null. */
export function staleHours(run: string, now = Date.now()): number | null {
  const h = (now - Date.parse(run)) / 3_600_000
  return h > STALE_AFTER_H ? Math.floor(h) : null
}
