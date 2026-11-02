// Water surface of the Bassin d'Arcachon, greyed on the map at low tide (src/lib/map/bassin.json).
// The basemap has no tidal flats here and its "ocean" polygon runs into the open sea, so the
// Bassin is cut out of it: the OpenFreeMap tiles' water (z12), clipped by a hand-drawn mask
// whose west side follows the middle of the Cap Ferret peninsula and whose south side crosses
// from Bélisaire (Cap Ferret) to the Jetée Thiers (Arcachon): the passes and the Arcachon front
// (Les Arbousiers), which still sail at low tide, stay clear. Run again only to redraw the shape:
//   node pipeline/bassin_water.mjs
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import pc from 'polygon-clipping'
import { writeFileSync } from 'node:fs'

const TILES = 'https://tiles.openfreemap.org/planet'
const Z = 12
const OUT = new URL('../src/lib/map/bassin.json', import.meta.url)
/** Simplification tolerance, degrees (~10 m). */
const TOLERANCE = 1e-4
// Lon/lat. Every edge runs over land or across the water; peninsula midline from the tiles' shorelines.
const MASK = [[
  [-1.2485, 44.665], [-1.2471, 44.68], [-1.2413, 44.7], [-1.2273, 44.72], [-1.2152, 44.74], [-1.2098, 44.76],
  [-1.205, 44.8], [-0.95, 44.8], [-0.95, 44.6], [-1.167, 44.6], [-1.167, 44.662], [-1.2485, 44.665],
]]

const n = 2 ** Z
const tileX = (lon) => Math.floor(((lon + 180) / 360) * n)
const tileY = (lat) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}
const lonOf = (x) => (x / n) * 360 - 180
const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI

/** Douglas-Peucker on a closed ring, split at the point farthest from its start. */
function simplify(ring) {
  const keep = new Uint8Array(ring.length)
  let pivot = 0
  for (let i = 1; i < ring.length; i++) {
    if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) > Math.hypot(ring[pivot][0] - ring[0][0], ring[pivot][1] - ring[0][1])) pivot = i
  }
  keep[0] = keep[pivot] = keep[ring.length - 1] = 1
  const stack = [[0, pivot], [pivot, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = ring[a], [bx, by] = ring[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1, dist = TOLERANCE
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len
      if (d > dist) (far = i), (dist = d)
    }
    if (far > 0) (keep[far] = 1), stack.push([a, far], [far, b])
  }
  return ring.filter((_, i) => keep[i])
}

const { tiles } = await (await fetch(TILES)).json()
const pieces = []
for (let x = tileX(-1.3); x <= tileX(-0.95); x++) {
  for (let y = tileY(44.8); y <= tileY(44.6); y++) {
    const url = tiles[0].replace('{z}', Z).replace('{x}', x).replace('{y}', y)
    const water = new VectorTile(new PbfReader(Buffer.from(await (await fetch(url)).arrayBuffer()))).layers.water
    if (!water) continue
    // Tiles overlap by a buffer: keep each tile's own square only.
    const square = [[[lonOf(x), latOf(y)], [lonOf(x + 1), latOf(y)], [lonOf(x + 1), latOf(y + 1)], [lonOf(x), latOf(y + 1)], [lonOf(x), latOf(y)]]]
    for (let i = 0; i < water.length; i++) {
      const f = water.feature(i)
      if (f.properties.class !== 'ocean') continue
      const g = f.toGeoJSON(x, y, Z).geometry
      pieces.push(...pc.intersection(g.type === 'Polygon' ? [g.coordinates] : g.coordinates, square))
    }
  }
}

const round = (v) => Math.round(v * 1e5) / 1e5
const bassin = pc
  .intersection(pc.union(...pieces.map((p) => [p])), MASK)
  .map((poly) => poly.map((ring) => simplify(ring).map(([lon, lat]) => [round(lon), round(lat)])).filter((r) => r.length >= 4))
writeFileSync(OUT, JSON.stringify({ type: 'MultiPolygon', coordinates: bassin }) + '\n')
console.log(`bassin.json: ${bassin.length} polygon(s), ${bassin.flat().reduce((s, r) => s + r.length, 0)} points`)
