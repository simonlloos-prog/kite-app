import type { FeatureCollection, Geometry, Point } from 'geojson'
import type { ExpressionSpecification, GeoJSONSource, ImageSource, Map as MlMap } from 'maplibre-gl'
import type { Picked } from '../stores/app.svelte'
import { rateSpot } from '../spots/rating'
import { SPOTS } from '../spots/spots'
import { keyOf, windCache } from '../wind/cache'
import { COLS, DOMAIN, nodeAt, ROWS } from '../wind/domain'
import { bilinear, fieldAt, levelOf, streamlines, type Kind } from '../wind/field'
import { valueAt } from '../wind/openMeteo'
import { binOf, binRgb } from '../wind/windColor'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const FONT = ['Noto Sans Bold']
const FIELD_PX = 512
/** Dense values and the fine wind-line set take over from this (integer, GeoJSON tiles) zoom. */
const DENSE_ZOOM = 12
const LEVEL_FILTER: ExpressionSpecification = ['any', ['==', ['get', 'lvl'], 0], ['>=', ['zoom'], DENSE_ZOOM]]
/** One wind-line set at a time: coarse when zoomed out, fine when zoomed in. */
const SET_FILTER: ExpressionSpecification = [
  'case',
  ['>=', ['zoom'], DENSE_ZOOM],
  ['==', ['get', 'set'], 1],
  ['==', ['get', 'set'], 0],
]

export interface Layers {
  field: boolean
  values: boolean
  arrows: boolean
  spots: boolean
}

const CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [DOMAIN.west, DOMAIN.north],
  [DOMAIN.east, DOMAIN.north],
  [DOMAIN.east, DOMAIN.south],
  [DOMAIN.west, DOMAIN.south],
]

const LINE_COLOR = '#0b1320'

/** Small open arrowhead pointing up, drawn at the downwind end of each wind line. */
function headImage() {
  const s = 20
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.lineCap = g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(4, 14)
  g.lineTo(s / 2, 4)
  g.lineTo(s - 4, 14)
  g.strokeStyle = LINE_COLOR
  g.lineWidth = 2.6
  g.stroke()
  return g.getImageData(0, 0, s, s)
}

/**
 * Stepped colour field over the domain with a dark edge where the bin changes,
 * like Meteociel's iso-lines. Stretched linearly between the corners: the Mercator
 * error over 0.35° of latitude is under a pixel.
 */
function renderField(grid: number[][]): string {
  const n = FIELD_PX
  const bins = new Int8Array(n * n)
  for (let y = 0; y < n; y++) {
    const fr = (1 - y / (n - 1)) * (ROWS - 1)
    for (let x = 0; x < n; x++) bins[y * n + x] = binOf(bilinear(grid, fr, (x / (n - 1)) * (COLS - 1)))
  }
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const b = bins[i]
    if (b < 0) continue
    const edge = (i % n < n - 1 && bins[i + 1] !== b) || (i < n * (n - 1) && bins[i + n] !== b)
    const [r, gr, bl] = binRgb(b)
    const k = edge ? 0.55 : 1
    const o = i * 4
    img.data[o] = r * k
    img.data[o + 1] = gr * k
    img.data[o + 2] = bl * k
    img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL()
}

// One image per (cache version, hour, kind): swiping back and forth costs nothing.
const fieldMemo = new Map<string, string>()
let memoVersion = -1

function fieldUrl(version: number, time: string, kind: Kind): string {
  if (version !== memoVersion) {
    fieldMemo.clear()
    memoVersion = version
  }
  const key = `${time}|${kind}`
  let url = fieldMemo.get(key)
  if (!url) fieldMemo.set(key, (url = renderField(fieldAt(time, kind))))
  return url
}

const empty = <G extends Geometry = Point>(): FeatureCollection<G> => ({ type: 'FeatureCollection', features: [] })

export function addWindLayers(map: MlMap) {
  map.addImage('wind-head', headImage(), { pixelRatio: 2 })
  map.addSource('wind-field', { type: 'image', url: renderField([[NaN, NaN], [NaN, NaN]]), coordinates: CORNERS })
  for (const id of ['wind-lines', 'wind-heads', 'wind-values', 'spots', 'picked'])
    map.addSource(id, { type: 'geojson', data: empty() })

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
    id: 'wind-lines',
    type: 'line',
    source: 'wind-lines',
    filter: SET_FILTER,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LINE_COLOR, 'line-width': 1.3, 'line-opacity': 0.7 },
  })
  map.addLayer({
    id: 'wind-heads',
    type: 'symbol',
    source: 'wind-heads',
    filter: SET_FILTER,
    layout: {
      'icon-image': 'wind-head',
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.75 },
  })
  map.addLayer({
    id: 'wind-values',
    type: 'symbol',
    source: 'wind-values',
    filter: LEVEL_FILTER,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': 13,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#0b1320', 'text-halo-color': 'rgba(255,255,255,.8)', 'text-halo-width': 1.4 },
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
    paint: { 'text-color': '#0b1320', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
  })
  map.addLayer({
    id: 'picked',
    type: 'circle',
    source: 'picked',
    paint: {
      'circle-radius': 9,
      'circle-color': 'rgba(255,255,255,.25)',
      'circle-stroke-color': '#0b1320',
      'circle-stroke-width': 3,
    },
  })
}

export function setFieldData(map: MlMap, version: number, time: string, kind: Kind) {
  ;(map.getSource('wind-field') as ImageSource).updateImage({ url: fieldUrl(version, time, kind), coordinates: CORNERS })
}

export function setGridData(map: MlMap, time: string, kind: Kind) {
  const lines = empty<GeoJSON.LineString>()
  const heads = empty()
  for (const s of streamlines(time)) {
    lines.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: s.coords }, properties: { set: s.set } })
    heads.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: s.coords[s.coords.length - 1] },
      properties: { bearing: s.bearing, set: s.set },
    })
  }
  ;(map.getSource('wind-lines') as GeoJSONSource).setData(lines)
  ;(map.getSource('wind-heads') as GeoJSONSource).setData(heads)

  const values = empty()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = nodeAt(r, c)
      const w = valueAt(windCache.get(keyOf(p)), time)
      const v = w && (kind === 'gust' ? w.gust : w.speed)
      if (v == null || Number.isNaN(v)) continue
      values.features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { label: String(Math.round(v)), lvl: levelOf(r, c) },
      })
    }
  }
  ;(map.getSource('wind-values') as GeoJSONSource).setData(values)
}

export function setSpotsData(map: MlMap, time: string) {
  const fc = empty()
  for (const s of SPOTS) {
    const r = rateSpot(s, valueAt(windCache.get(keyOf(s)), time))
    fc.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { name: s.name, color: r.color },
    })
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
  map.setLayoutProperty('wind-lines', 'visibility', vis(l.arrows))
  map.setLayoutProperty('wind-heads', 'visibility', vis(l.arrows))
  map.setLayoutProperty('wind-values', 'visibility', vis(l.values))
  map.setLayoutProperty('spots-circle', 'visibility', vis(l.spots))
  map.setLayoutProperty('spots-label', 'visibility', vis(l.spots))
}
