type Rgb = [number, number, number]

/** Continuous kite-oriented scale in knots, Meteociel-like: white → blue → green → yellow → red → purple. */
export const STOPS: [number, Rgb][] = [
  [0, [255, 255, 255]],
  [6, [165, 205, 255]],
  [10, [59, 130, 246]],
  [14, [16, 185, 129]],
  [18, [163, 230, 53]],
  [22, [250, 204, 21]],
  [26, [249, 115, 22]],
  [30, [239, 68, 68]],
  [35, [192, 38, 211]],
  [45, [109, 40, 217]],
]

export function windRgb(kn: number): Rgb {
  if (Number.isNaN(kn)) return [148, 163, 184]
  if (kn <= 0) return STOPS[0][1]
  for (let i = 1; i < STOPS.length; i++) {
    const [k1, c1] = STOPS[i]
    if (kn <= k1) {
      const [k0, c0] = STOPS[i - 1]
      const t = (kn - k0) / (k1 - k0)
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * t)) as Rgb
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export function windColor(kn: number): string {
  const [r, g, b] = windRgb(kn)
  return `rgb(${r} ${g} ${b})`
}
