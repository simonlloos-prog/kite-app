// Land inside BOX (src/lib/map/land.json), laid over the wave map: MFWAM cells are 2.5 km wide,
// so its bands would stop short of the beach or spill onto the land. The waves are spread a
// little inland (wave.ts, fillCoast), then this mask cuts them at the real coastline.
// Land = BOX minus the OpenFreeMap tiles' "ocean" water (z11, which includes the Bassin and the
// Gironde estuary). Lakes are land here: the map draws them grey on top. Run again only to redraw:
//   node pipeline/land_mask.mjs
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import pc from 'polygon-clipping'
import { writeFileSync } from 'node:fs'

const TILES = 'https://tiles.openfreemap.org/planet'
const Z = 11
const OUT = new URL('../src/lib/map/land.json', import.meta.url)
/** Same as BOX in fetch_arome.py, a little wider so the mask never leaves a strip at the edge. */
const BOX = { south: 43.5, north: 45.9, west: -2.05, east: -0.55 }
/** Simplification tolerance, degrees (~30 m): finer than any wave detail. */
const TOLERANCE = 3e-4

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
for (let x = tileX(BOX.west); x <= tileX(BOX.east); x++) {
  for (let y = tileY(BOX.north); y <= tileY(BOX.south); y++) {
    const url = tiles[0].replace('{z}', Z).replace('{x}', x).replace('{y}', y)
    const water = new VectorTile(new PbfReader(Buffer.from(await (await fetch(url)).arrayBuffer()))).layers.water
    // Open sea tiles carry the ocean polygon too: a tile without water is all land.
    if (!water) continue
    const square = [[[lonOf(x), latOf(y)], [lonOf(x + 1), latOf(y)], [lonOf(x + 1), latOf(y + 1)], [lonOf(x), latOf(y + 1)], [lonOf(x), latOf(y)]]]
    for (let i = 0; i < water.length; i++) {
      const f = water.feature(i)
      if (f.properties.class !== 'ocean') continue
      const g = f.toGeoJSON(x, y, Z).geometry
      pieces.push(...pc.intersection(g.type === 'Polygon' ? [g.coordinates] : g.coordinates, square))
    }
  }
}

const box = [[[BOX.west, BOX.south], [BOX.east, BOX.south], [BOX.east, BOX.north], [BOX.west, BOX.north], [BOX.west, BOX.south]]]
const round = (v) => Math.round(v * 1e5) / 1e5
const land = pc
  .difference(box, ...pieces.map((p) => [p]))
  .map((poly) => poly.map((ring) => simplify(ring).map(([lon, lat]) => [round(lon), round(lat)])).filter((r) => r.length >= 4))
  .filter((poly) => poly.length)
writeFileSync(OUT, JSON.stringify({ type: 'MultiPolygon', coordinates: land }) + '\n')
console.log(`land.json: ${land.length} polygon(s), ${land.flat().reduce((s, r) => s + r.length, 0)} points`)
