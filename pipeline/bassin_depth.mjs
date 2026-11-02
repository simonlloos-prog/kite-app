// Ground height inside the Bassin d'Arcachon, to draw what dries out at each hour of the tide
// (src/lib/map/bassin-depth.bin + bassin-depth.json). Source: Shom, "MNT topo-bathymétrique côtier
// du bassin d'Arcachon et ses abords (projet HOMONIM)", 20 m, heights above mean sea level (NM),
// Licence Ouverte 2.0, on data.gouv.fr. Download the NM archive, extract it, then:
//   node pipeline/bassin_depth.mjs <path to MNT_COTIER_ARCACHON_HOMONIM_20m_WGS84_NM_ZNEG.asc>
// Output: int8 per cell, decimetres above mean sea level (clamped to ±12.7 m), row 0 = south;
// OUTSIDE where the cell is not in the Bassin's water (src/lib/map/bassin.json).
import { readFileSync, writeFileSync } from 'node:fs'

/** Cell size of the output, degrees: 2 × 2 source cells (~30 × 45 m). */
const STEP = 0.0004
const OUTSIDE = -128
const bassin = JSON.parse(readFileSync(new URL('../src/lib/map/bassin.json', import.meta.url)))

const lines = readFileSync(process.argv[2], 'latin1').split('\n')
const hdr = Object.fromEntries(lines.slice(0, 6).map((l) => l.trim().split(/\s+/)).map(([k, v]) => [k.toLowerCase(), Number(v)]))
const { ncols, nrows, xllcorner, yllcorner, cellsize, nodata_value } = hdr
const factor = Math.round(STEP / cellsize)

// Bounding box of the Bassin outline, snapped to the source grid.
const pts = bassin.coordinates.flat(2)
const west = Math.min(...pts.map((p) => p[0]))
const east = Math.max(...pts.map((p) => p[0]))
const south = Math.min(...pts.map((p) => p[1]))
const north = Math.max(...pts.map((p) => p[1]))
const c0 = Math.floor((west - xllcorner) / cellsize / factor) * factor
const r0 = Math.floor((south - yllcorner) / cellsize / factor) * factor // rows from the south
const cols = Math.ceil((east - xllcorner) / cellsize / factor) - c0 / factor
const rows = Math.ceil((north - yllcorner) / cellsize / factor) - r0 / factor

/** Source height at (row from the south, column), NaN without data. */
const rowCache = new Map()
function src(r, c) {
  if (!rowCache.has(r)) rowCache.set(r, lines[6 + (nrows - 1 - r)].trim().split(/\s+/).map(Number))
  const v = rowCache.get(r)[c]
  return v === nodata_value || v === undefined ? NaN : v
}

/** Even-odd rule over every ring: holes (islands) come out as outside. */
function inBassin(lon, lat) {
  let inside = false
  for (const poly of bassin.coordinates) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
  }
  return inside
}

const out = new Int8Array(rows * cols).fill(OUTSIDE)
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const lon = xllcorner + (c0 + (c + 0.5) * factor) * cellsize
    const lat = yllcorner + (r0 + (r + 0.5) * factor) * cellsize
    if (!inBassin(lon, lat)) continue
    let sum = 0, n = 0
    for (let dr = 0; dr < factor; dr++) {
      for (let dc = 0; dc < factor; dc++) {
        const v = src(r0 + r * factor + dr, c0 + c * factor + dc)
        if (!Number.isNaN(v)) (sum += v), n++
      }
    }
    if (n) out[r * cols + c] = Math.max(-127, Math.min(127, Math.round((sum / n) * 10)))
  }
}

// Same convention as the AROME grid: south/west give the centre of the first cell.
const grid = {
  south: +(yllcorner + r0 * cellsize + STEP / 2).toFixed(6),
  west: +(xllcorner + c0 * cellsize + STEP / 2).toFixed(6),
  step: STEP,
  rows,
  cols,
}
writeFileSync(new URL('../src/lib/map/bassin-depth.bin', import.meta.url), out)
writeFileSync(new URL('../src/lib/map/bassin-depth.json', import.meta.url), JSON.stringify(grid) + '\n')
console.log(`bassin-depth: ${cols} × ${rows} cells, ${out.filter((v) => v !== OUTSIDE).length} in the Bassin`)
