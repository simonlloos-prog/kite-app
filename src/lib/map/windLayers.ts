import type { FeatureCollection, Geometry, MultiLineString, Point } from 'geojson'
import type { GeoJSONSource, ImageSource, Map as MlMap } from 'maplibre-gl'
import type { Picked } from '../stores/app.svelte'
import { rateSpot } from '../spots/rating'
import { SPOTS } from '../spots/spots'
import { windAt, type Grid, type Hour } from '../wind/arome'
import { gridSymbols, sample, valuesOf, type Bounds, type Kind } from '../wind/field'
import { binOf, binRgb } from '../wind/windColor'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const FONT = ['Noto Sans Bold']
const INK = '#0b1320'
/** Field image pixels per grid cell. */
const PX_PER_CELL = 6

export interface Layers {
  field: boolean
  values: boolean
  arrows: boolean
  spots: boolean
}

type Corners = [[number, number], [number, number], [number, number], [number, number]]

function corners(g: Grid): Corners {
  const north = g.south + (g.rows - 1) * g.step
  const east = g.west + (g.cols - 1) * g.step
  return [
    [g.west, north],
    [east, north],
    [east, g.south],
    [g.west, g.south],
  ]
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90

/**
 * Stepped colour field with a dark edge where the bin changes, like Meteociel's iso-lines.
 * MapLibre stretches the image linearly in Mercator space, so rows are spaced in Mercator Y.
 */
function renderField(g: Grid, values: Float32Array): string {
  const w = (g.cols - 1) * PX_PER_CELL + 1
  const h = (g.rows - 1) * PX_PER_CELL + 1
  const north = g.south + (g.rows - 1) * g.step
  const [yN, yS] = [mercY(north), mercY(g.south)]
  const bins = new Int8Array(w * h)
  for (let y = 0; y < h; y++) {
    const fr = (invMercY(yN + ((yS - yN) * y) / (h - 1)) - g.south) / g.step
    for (let x = 0; x < w; x++) bins[y * w + x] = binOf(sample(g, values, fr, x / PX_PER_CELL))
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const b = bins[i]
    if (b < 0) continue
    const edge = (i % w < w - 1 && bins[i + 1] !== b) || (i < w * (h - 1) && bins[i + w] !== b)
    const [r, gr, bl] = binRgb(b)
    const k = edge ? 0.55 : 1
    img.data.set([r * k, gr * k, bl * k, 255], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

// One image per (run, hour, kind): swiping back and forth costs nothing.
const fieldMemo = new Map<string, string>()

const empty = <G extends Geometry = Point>(): FeatureCollection<G> => ({ type: 'FeatureCollection', features: [] })

export function addWindLayers(map: MlMap, g: Grid) {
  map.addSource('wind-field', { type: 'image', url: renderField({ ...g, rows: 2, cols: 2 }, new Float32Array(4).fill(NaN)), coordinates: corners(g) })
  for (const id of ['wind-strokes', 'wind-values', 'spots', 'picked']) map.addSource(id, { type: 'geojson', data: empty() })

  // Under the basemap labels, so place names stay readable on top of the colours.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: 'wind-field',
      type: 'raster',
      source: 'wind-field',
      paint: { 'raster-opacity': 0.72, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
    },
    firstLabel,
  )
  map.addLayer({
    id: 'wind-strokes',
    type: 'line',
    source: 'wind-strokes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': 0.75 },
  })
  map.addLayer({
    id: 'wind-values',
    type: 'symbol',
    source: 'wind-values',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': 11,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': INK, 'text-halo-color': 'rgba(255,255,255,.7)', 'text-halo-width': 1 },
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

export function setFieldData(map: MlMap, g: Grid, run: string, time: string, h: Hour, kind: Kind) {
  const key = `${run}|${time}|${kind}`
  let url = fieldMemo.get(key)
  if (!url) {
    if (fieldMemo.size > 120) fieldMemo.clear()
    fieldMemo.set(key, (url = renderField(g, valuesOf(h, kind))))
  }
  ;(map.getSource('wind-field') as ImageSource).updateImage({ url, coordinates: corners(g) })
}

export function setGridData(map: MlMap, g: Grid, h: Hour, kind: Kind, stride: number, bounds: Bounds) {
  const { labels, strokes } = gridSymbols(g, h, valuesOf(h, kind), stride, bounds)
  const lines = empty<MultiLineString>()
  for (const s of strokes) lines.features.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [s.shaft, s.head] }, properties: {} })
  const values = empty()
  for (const l of labels) values.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: l.coord }, properties: { label: String(l.value) } })
  ;(map.getSource('wind-strokes') as GeoJSONSource).setData(lines)
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
  map.setLayoutProperty('wind-field', 'visibility', vis(l.field))
  map.setLayoutProperty('wind-strokes', 'visibility', vis(l.arrows))
  map.setLayoutProperty('wind-values', 'visibility', vis(l.values))
  map.setLayoutProperty('spots-circle', 'visibility', vis(l.spots))
  map.setLayoutProperty('spots-label', 'visibility', vis(l.spots))
}
