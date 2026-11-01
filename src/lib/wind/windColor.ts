/** Kite-oriented scale, in knots. */
const SCALE: [number, string][] = [
  [8, '#94a3b8'],
  [12, '#38bdf8'],
  [16, '#22c55e'],
  [20, '#facc15'],
  [25, '#fb923c'],
  [30, '#ef4444'],
  [35, '#d946ef'],
  [Infinity, '#8b5cf6'],
]

export function windColor(kn: number): string {
  if (Number.isNaN(kn)) return '#94a3b8'
  return SCALE.find(([max]) => kn < max)![1]
}
