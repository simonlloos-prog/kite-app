import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, ImageSource, Map as MlMap } from 'maplibre-gl'
import type { Picked } from '../stores/app.svelte'
import { rateSpot } from '../spots/rating'
import { SPOTS } from '../spots/spots'
import { keyOf, windCache } from '../wind/cache'
import { COLS, DOMAIN, domainPoints, ROWS } from '../wind/domain'
import { bilinear, fieldAt, type Kind } from '../wind/field'
import { valueAt } from '../wind/openMeteo'
import { windRgb } from '../wind/windColor'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const FONT = ['Noto Sans Bold']
const FIELD_PX = 256

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

/** Upward arrow drawn once as an SDF image, so it can be tinted. */
function arrowImage(size = 48) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const s = size / 48
  g.beginPath()
  for (const [x, y] of [[24, 4], [36, 22], [27.5, 20], [27.5, 44], [20.5, 44], [20.5, 20], [12, 22]]) g.lineTo(x * s, y * s)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

/**
 * Smooth colour field over the domain, as a PNG data URL. The image is stretched linearly
 * between the corners: the Mercator error over 0.35° of latitude is under a pixel.
 */
function renderField(grid: number[][]): string {
  const c = document.createElement('canvas')
  c.width = c.height = FIELD_PX
  const g = c.getContext('2d')!
  const img = g.createImageData(FIELD_PX, FIELD_PX)
  for (let y = 0; y < FIELD_PX; y++) {
    const fr = (1 - y / (FIELD_PX - 1)) * (ROWS - 1)
    for (let x = 0; x < FIELD_PX; x++) {
      const v = bilinear(grid, fr, (x / (FIELD_PX - 1)) * (COLS - 1))
      const o = (y * FIELD_PX + x) * 4
      if (Number.isNaN(v)) continue
      ;[img.data[o], img.data[o + 1], img.data[o + 2]] = windRgb(v)
      img.data[o + 3] = 255
    }
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

const empty = (): FeatureCollection<Point> => ({ type: 'FeatureCollection', features: [] })

export function addWindLayers(map: MlMap) {
  map.addImage('wind-arrow', arrowImage(), { sdf: true, pixelRatio: 2 })
  map.addSource('wind-field', { type: 'image', url: renderField([[NaN, NaN], [NaN, NaN]]), coordinates: CORNERS })
  map.addSource('wind-points', { type: 'geojson', data: empty() })
  map.addSource('spots', { type: 'geojson', data: empty() })
  map.addSource('picked', { type: 'geojson', data: empty() })

  // Under the basemap labels, so place names stay readable on top of the colours.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: 'wind-field',
      type: 'raster',
      source: 'wind-field',
      paint: { 'raster-opacity': 0.6, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
    },
    firstLabel,
  )
  map.addLayer({
    id: 'wind-points',
    type: 'symbol',
    source: 'wind-points',
    layout: {
      'icon-image': 'wind-arrow',
      'icon-size': 0.55,
      // `dir` is where the wind comes from: the arrow points where it goes.
      'icon-rotate': ['+', ['get', 'dir'], 180],
      'icon-rotation-alignment': 'map',
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': 12,
      'text-offset': [0, 1.1],
      // Collisions thin the grid out automatically when zooming out.
      'symbol-sort-key': ['get', 'order'],
    },
    paint: {
      'icon-color': '#0b1320',
      'icon-opacity': 0.75,
      'text-color': '#0b1320',
      'text-halo-color': 'rgba(255,255,255,.75)',
      'text-halo-width': 1.2,
    },
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

export function setPointsData(map: MlMap, time: string, kind: Kind) {
  const fc = empty()
  domainPoints().forEach((p, i) => {
    const w = valueAt(windCache.get(keyOf(p)), time)
    if (!w) return
    const v = kind === 'gust' ? w.gust : w.speed
    // Every other row and column first, so zooming out keeps an even grid.
    const r = Math.floor(i / COLS)
    const order = (r % 2) + ((i % COLS) % 2)
    fc.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { dir: w.dir, label: Number.isNaN(v) ? '' : String(Math.round(v)), order },
    })
  })
  ;(map.getSource('wind-points') as GeoJSONSource).setData(fc)
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
  map.setLayoutProperty('wind-points', 'visibility', vis(l.values || l.arrows))
  map.setLayoutProperty('wind-points', 'icon-image', l.arrows ? 'wind-arrow' : '')
  map.setLayoutProperty('wind-points', 'text-field', l.values ? ['get', 'label'] : '')
  // Values sit under the arrow, or on the point itself when arrows are hidden.
  map.setLayoutProperty('wind-points', 'text-offset', l.arrows ? [0, 1.1] : [0, 0])
  map.setLayoutProperty('spots-circle', 'visibility', vis(l.spots))
  map.setLayoutProperty('spots-label', 'visibility', vis(l.spots))
}
