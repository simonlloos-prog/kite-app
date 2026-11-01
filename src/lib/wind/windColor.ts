type Rgb = [number, number, number]

/**
 * Meteociel-like stepped scale in knots: each bin has a flat colour so strength
 * zones read at a glance. `[lower bound, colour]`, ascending.
 */
export const BINS: [number, string][] = [
  [0, '#ffffff'],
  [2, '#d6ecff'],
  [4, '#a8d4ff'],
  [6, '#6fb3ff'],
  [8, '#3b8cf0'],
  [10, '#1fc8e0'],
  [12, '#19c27a'],
  [14, '#5fd83a'],
  [16, '#b4e61e'],
  [18, '#f2e01a'],
  [20, '#f7b51a'],
  [22, '#f7861a'],
  [25, '#ef4b2a'],
  [28, '#d21f3c'],
  [31, '#b0127a'],
  [35, '#8a1fbf'],
  [40, '#5b21b6'],
]

const hexRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
const BIN_RGB = BINS.map(([, h]) => hexRgb(h))
const NO_DATA: Rgb = [148, 163, 184]

/** Index of the bin holding `kn`, -1 for NaN. */
export function binOf(kn: number): number {
  if (Number.isNaN(kn)) return -1
  let i = 0
  while (i + 1 < BINS.length && kn >= BINS[i + 1][0]) i++
  return i
}

export const binRgb = (bin: number): Rgb => (bin < 0 ? NO_DATA : BIN_RGB[bin])

export const windRgb = (kn: number): Rgb => binRgb(binOf(kn))

export function windColor(kn: number): string {
  const [r, g, b] = windRgb(kn)
  return `rgb(${r} ${g} ${b})`
}
