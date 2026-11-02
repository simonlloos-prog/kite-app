import type { FeatureCollection, Geometry, LineString, MultiPolygon, Point } from 'geojson'
import type { FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { Picked } from '../stores/app.svelte'
import { rateSpot } from '../spots/rating'
import { SPOTS } from '../spots/spots'
import { windAt, type Grid, type Hour } from '../wind/arome'
import { isobands, labels, pxPerCell, streamlines, strideFor, valuesOf, type Bounds, type Kind } from '../wind/field'
import { fmtSpeed, type Unit } from '../wind/units'
import { BINS } from '../wind/windColor'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const FONT = ['Noto Sans Bold']
const INK = '#0b1320'
/** Large lakes by OSM id: OSM "lakes" also cover fish ponds and reservoirs, and tiles carry no area. */
const BIG_LAKES = [
  1450359, // Hourtin-Carcans
  4848920, // Lacanau
  12092675, // Cazaux-Sanguinet
  2208673, // Parentis-Biscarrosse
  5872322, // Petit étang de Biscarrosse
  161453, // Aureilhan
  1708556, // Léon
  1705749, // Soustons
  301878862, // Hossegor
]
const COAST_FILTER: FilterSpecification = [
  'any',
  ['==', ['get', 'class'], 'ocean'],
  ['all', ['==', ['get', 'class'], 'lake'], ['in', ['get', 'id'], ['literal', BIG_LAKES]]],
]
/** Screen distance between wind lines: tight, so local bends show up. */
const LINE_SEP_PX = 14
/** Screen distance between labels: one per grid point as soon as they fit, like Meteociel. */
const LABEL_PX = 14

export interface Layers {
  field: boolean
  values: boolean
  arrows: boolean
  spots: boolean
}

/** Open arrowhead pointing east: line-placed symbols align their x axis with the line. */
function chevronImage() {
  const s = 24
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.lineCap = g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(7, 5)
  g.lineTo(17, 12)
  g.lineTo(7, 19)
  g.strokeStyle = INK
  g.lineWidth = 3
  g.stroke()
  return g.getImageData(0, 0, s, s)
}

const empty = <G extends Geometry = Point>(): FeatureCollection<G> => ({ type: 'FeatureCollection', features: [] })

/** The data area, so the map cannot leave it: no edge with nothing behind. */
export function gridBounds(g: Grid): [[number, number], [number, number]] {
  return [
    [g.west, g.south],
    [g.west + (g.cols - 1) * g.step, g.south + (g.rows - 1) * g.step],
  ]
}

export function addWindLayers(map: MlMap) {
  map.addImage('wind-chevron', chevronImage(), { pixelRatio: 2 })
  for (const id of ['wind-bands', 'wind-lines', 'wind-values', 'spots', 'picked']) map.addSource(id, { type: 'geojson', data: empty() })

  // Opaque bands under the basemap labels, like Meteociel; the coastline is redrawn on top.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: 'wind-bands',
      type: 'fill',
      source: 'wind-bands',
      paint: { 'fill-color': ['get', 'color'], 'fill-antialias': false },
    },
    firstLabel,
  )
  map.addLayer(
    {
      id: 'wind-band-edges',
      type: 'line',
      source: 'wind-bands',
      paint: { 'line-color': 'rgba(11,19,32,.35)', 'line-width': 0.7 },
    },
    firstLabel,
  )
  // Coastline: a light casing under a dark line, so it stands out on every band colour.
  // Sea, Bassin and the large lakes only: all OSM "lake" polygons include the Piraillan fish
  // ponds on the shore, which drew a stray rectangle in the water.
  map.addLayer(
    {
      id: 'coastline-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: COAST_FILTER,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 5], 'line-opacity': 0.55 },
    },
    firstLabel,
  )
  map.addLayer(
    {
      id: 'coastline',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: COAST_FILTER,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 13, 2.4] },
    },
    firstLabel,
  )
  map.addLayer({
    id: 'wind-lines',
    type: 'line',
    source: 'wind-lines',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': 0.9, 'line-opacity': 0.65 },
  })
  map.addLayer({
    id: 'wind-heads',
    type: 'symbol',
    source: 'wind-lines',
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 35,
      'icon-image': 'wind-chevron',
      'icon-size': 0.8,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.8 },
  })
  map.addLayer({
    id: 'wind-values',
    type: 'symbol',
    source: 'wind-values',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': 9,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': INK, 'text-halo-color': 'rgba(255,255,255,.6)', 'text-halo-width': 1 },
  })
  map.addLayer({
    id: 'spots-circle',
    type: 'circle',
    source: 'spots',
    paint: {
      'circle-radius': 7,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'spots-label',
    type: 'symbol',
    source: 'spots',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [0.9, 0],
    },
    paint: { 'text-color': INK, 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
  })
  map.addLayer({
    id: 'picked',
    type: 'circle',
    source: 'picked',
    paint: {
      'circle-radius': 9,
      'circle-color': 'rgba(255,255,255,.25)',
      'circle-stroke-color': INK,
      'circle-stroke-width': 3,
    },
  })
}

// Bands only change with the hour: keep the last few, swiping back and forth costs nothing.
const bandMemo = new Map<string, FeatureCollection<MultiPolygon>>()

export function setBandsData(map: MlMap, g: Grid, run: string, time: string, h: Hour, kind: Kind) {
  const key = `${run}|${time}|${kind}`
  let fc = bandMemo.get(key)
  if (!fc) {
    const colors = new Map(BINS)
    fc = empty<MultiPolygon>()
    for (const b of isobands(g, valuesOf(h, kind), BINS.map(([min]) => min))) {
      fc.features.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: b.polygons }, properties: { color: colors.get(b.min) } })
    }
    if (bandMemo.size > 60) bandMemo.clear()
    bandMemo.set(key, fc)
  }
  ;(map.getSource('wind-bands') as GeoJSONSource).setData(fc)
}

export interface View {
  zoom: number
  bounds: Bounds
  unit: Unit
}

export function setLinesData(map: MlMap, g: Grid, h: Hour, kind: Kind, v: View) {
  const lines = empty<LineString>()
  for (const coords of streamlines(g, h, LINE_SEP_PX / pxPerCell(g, v.zoom), v.bounds)) {
    lines.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
  }
  ;(map.getSource('wind-lines') as GeoJSONSource).setData(lines)

  const values = empty()
  for (const l of labels(g, valuesOf(h, kind), strideFor(g, v.zoom, LABEL_PX), v.bounds)) {
    values.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: l.coord }, properties: { label: fmtSpeed(l.value, v.unit) } })
  }
  ;(map.getSource('wind-values') as GeoJSONSource).setData(values)
}

export function setSpotsData(map: MlMap, g: Grid, h: Hour | undefined) {
  const fc = empty()
  for (const s of SPOTS) {
    const r = rateSpot(s, windAt(g, h, s))
    fc.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { name: s.name, color: r.color } })
  }
  ;(map.getSource('spots') as GeoJSONSource).setData(fc)
}

export function setPickedData(map: MlMap, p: Picked | null) {
  const fc = empty()
  if (p) fc.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: {} })
  ;(map.getSource('picked') as GeoJSONSource).setData(fc)
}

export function setLayerVisibility(map: MlMap, l: Layers) {
  const vis = (on: boolean) => (on ? 'visible' : 'none')
  for (const id of ['wind-bands', 'wind-band-edges']) map.setLayoutProperty(id, 'visibility', vis(l.field))
  for (const id of ['wind-lines', 'wind-heads']) map.setLayoutProperty(id, 'visibility', vis(l.arrows))
  map.setLayoutProperty('wind-values', 'visibility', vis(l.values))
  for (const id of ['spots-circle', 'spots-label']) map.setLayoutProperty(id, 'visibility', vis(l.spots))
}
