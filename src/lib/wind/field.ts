import { nodeAt, type Grid, type Hour } from './arome'

export type Kind = 'speed' | 'gust'

/** Value per cell for the colour field and the labels. */
export function valuesOf(h: Hour, kind: Kind): Float32Array {
  if (kind === 'gust') return h.gust
  const out = new Float32Array(h.u.length)
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(h.u[k], h.v[k])
  return out
}

/** Bilinear sample at fractional row/col indices, clamped to the grid. */
export function sample(g: Grid, a: Float32Array, fr: number, fc: number): number {
  fr = Math.max(0, Math.min(g.rows - 1, fr))
  fc = Math.max(0, Math.min(g.cols - 1, fc))
  const r0 = Math.min(Math.floor(fr), g.rows - 2)
  const c0 = Math.min(Math.floor(fc), g.cols - 2)
  const tr = fr - r0
  const tc = fc - c0
  const i = r0 * g.cols + c0
  const top = a[i] * (1 - tc) + a[i + 1] * tc
  const bottom = a[i + g.cols] * (1 - tc) + a[i + g.cols + 1] * tc
  return top * (1 - tr) + bottom * tr
}

/** Smallest power-of-two stride that keeps grid symbols at least `minPx` apart on screen. */
export function strideFor(g: Grid, zoom: number, minPx = 20): number {
  // Longitude cells are the narrowest on screen. MapLibre zoom levels use 512 px tiles.
  const pxPerCell = (g.step * 512 * 2 ** zoom) / 360
  let k = 1
  while (k * pxPerCell < minPx && k < 32) k *= 2
  return k
}

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Label {
  coord: [number, number]
  value: number
}

/** A short arrow: shaft from tail to tip, and the two barbs of the head. */
export interface Stroke {
  shaft: [[number, number], [number, number]]
  head: [[number, number], [number, number], [number, number]]
}

/**
 * Meteociel-like grid: on the lattice of cells every `k`, one cell in four (odd row, odd
 * column of the lattice) shows its value, the others a short arrow along the wind.
 * Strokes are as long as the lattice spacing, so neighbours line up into continuous lines.
 * Only cells inside `bounds` are emitted.
 */
export function gridSymbols(g: Grid, h: Hour, values: Float32Array, k: number, bounds: Bounds) {
  const rad = Math.PI / 180
  const labels: Label[] = []
  const strokes: Stroke[] = []
  // The epsilon keeps 59.99999 (float division) from dropping the edge row.
  const eps = 1e-6
  const r0 = Math.max(0, Math.ceil((bounds.south - g.south) / g.step / k - eps) * k)
  const r1 = Math.min(g.rows - 1, Math.floor((bounds.north - g.south) / g.step + eps))
  const c0 = Math.max(0, Math.ceil((bounds.west - g.west) / g.step / k - eps) * k)
  const c1 = Math.min(g.cols - 1, Math.floor((bounds.east - g.west) / g.step + eps))
  for (let r = r0; r <= r1; r += k) {
    const { lat } = nodeAt(g, r, 0)
    const cosLat = Math.cos(lat * rad)
    // Half length in degrees of latitude, sized on the narrowest (east-west) spacing.
    const half = 0.42 * k * g.step * cosLat
    for (let c = c0; c <= c1; c += k) {
      const i = r * g.cols + c
      const lon = g.west + c * g.step
      if ((r / k) % 2 === 1 && (c / k) % 2 === 1) {
        if (!Number.isNaN(values[i])) labels.push({ coord: [lon, lat], value: Math.round(values[i]) })
        continue
      }
      const u = h.u[i]
      const v = h.v[i]
      const speed = Math.hypot(u, v)
      if (!(speed > 0.25)) continue
      // Unit vector where the wind goes, in degrees (longitude stretched by 1 / cos lat).
      const dn = v / speed
      const de = u / speed / cosLat
      const tip: [number, number] = [lon + de * half, lat + dn * half]
      const tail: [number, number] = [lon - de * half, lat - dn * half]
      // Barbs: back from the tip, ±30° off the shaft.
      const barb = (sign: 1 | -1): [number, number] => {
        const a = sign * 30 * rad
        const bn = -(dn * Math.cos(a) - de * cosLat * Math.sin(a))
        const be = -(de * cosLat * Math.cos(a) + dn * Math.sin(a)) / cosLat
        return [tip[0] + be * half * 0.45, tip[1] + bn * half * 0.45]
      }
      strokes.push({ shaft: [tail, tip], head: [barb(1), tip, barb(-1)] })
    }
  }
  return { labels, strokes }
}
