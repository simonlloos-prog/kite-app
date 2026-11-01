const SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'] as const
export type Sector = (typeof SECTORS)[number]

const norm = (deg: number) => ((deg % 360) + 360) % 360

export const sector = (deg: number): Sector => SECTORS[Math.round(norm(deg) / 22.5) % 16]

export const sectorAngle = (s: Sector) => SECTORS.indexOf(s) * 22.5

/** Smallest angle between two headings, 0..180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b))
  return d > 180 ? 360 - d : d
}

const BEAUFORT_KN = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64]
export const beaufort = (kn: number) => {
  const i = BEAUFORT_KN.findIndex((max) => kn < max)
  return i < 0 ? 12 : i
}

export const knToKmh = (kn: number) => kn * 1.852

/** Display unit. Data and thresholds stay in knots; only what is shown is converted. */
export type Unit = 'kn' | 'kmh'
export const UNIT_LABEL: Record<Unit, string> = { kn: 'kn', kmh: 'km/h' }

/** A speed in knots, converted and rounded for display; '–' when missing. */
export function fmtSpeed(kn: number, unit: Unit): string {
  if (Number.isNaN(kn)) return '–'
  return String(Math.round(unit === 'kmh' ? knToKmh(kn) : kn))
}
