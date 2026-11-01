import { keyOf, windCache } from './cache'
import { COLS, nodeAt, ROWS } from './domain'

export type Kind = 'speed' | 'gust'

/** Values over the domain at one hour, `[row][col]`, NaN where missing. */
export function fieldAt(time: string, kind: Kind, cache = windCache): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) {
      const s = cache.get(keyOf(nodeAt(r, c)))
      const i = s ? s.times.indexOf(time) : -1
      row.push(i < 0 ? NaN : s![kind][i])
    }
    grid.push(row)
  }
  return grid
}

/** Bilinear sample at fractional row/col indices. */
export function bilinear(grid: number[][], fr: number, fc: number): number {
  const r0 = Math.min(Math.floor(fr), grid.length - 2)
  const c0 = Math.min(Math.floor(fc), grid[0].length - 2)
  const tr = fr - r0
  const tc = fc - c0
  const top = grid[r0][c0] * (1 - tc) + grid[r0][c0 + 1] * tc
  const bottom = grid[r0 + 1][c0] * (1 - tc) + grid[r0 + 1][c0 + 1] * tc
  return top * (1 - tr) + bottom * tr
}
