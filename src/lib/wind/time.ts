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
