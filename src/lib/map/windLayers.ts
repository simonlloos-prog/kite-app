import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { rateSpot } from '../spots/rating'
import { SPOTS } from '../spots/spots'
import { keyOf, windCache } from '../wind/cache'
import { valueAt, type LatLon } from '../wind/openMeteo'
import { windColor } from '../wind/windColor'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const FONT = ['Noto Sans Bold']

export interface Layers {
  values: boolean
  arrows: boolean
  spots: boolean
}

/** Upward arrow drawn once as an SDF image, so it can be tinted per feature. */
function arrowImage(size = 48) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const s = size / 48
  g.fillStyle = '#000'
  g.beginPath()
  g.moveTo(24 * s, 4 * s)
  g.lineTo(36 * s, 22 * s)
  g.lineTo(27.5 * s, 20 * s)
  g.lineTo(27.5 * s, 44 * s)
  g.lineTo(20.5 * s, 44 * s)
  g.lineTo(20.5 * s, 20 * s)
  g.lineTo(12 * s, 22 * s)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

const empty = (): FeatureCollection<Point> => ({ type: 'FeatureCollection', features: [] })

export function addWindLayers(map: MlMap) {
  map.addImage('wind-arrow', arrowImage(), { sdf: true, pixelRatio: 2 })
  map.addSource('wind-grid', { type: 'geojson', data: empty() })
  map.addSource('spots', { type: 'geojson', data: empty() })

  map.addLayer({
    id: 'wind-arrows',
    type: 'symbol',
    source: 'wind-grid',
    layout: {
      'icon-image': 'wind-arrow',
      'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.55, 30, 1],
      // `dir` is where the wind comes from: the arrow points where it goes.
      'icon-rotate': ['+', ['get', 'dir'], 180],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': 'rgba(11,19,32,.7)', 'icon-halo-width': 1 },
  })
  map.addLayer({
    id: 'wind-values',
    type: 'symbol',
    source: 'wind-grid',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': 13,
      'text-offset': [0, 1.15],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#0b1320', 'text-halo-width': 1.4 },
  })
  map.addLayer({
    id: 'spots-circle',
    type: 'circle',
    source: 'spots',
    paint: {
      'circle-radius': 8,
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
}

export function setGridData(map: MlMap, points: LatLon[], time: string) {
  const fc = empty()
  for (const p of points) {
    const w = valueAt(windCache.get(keyOf(p)), time)
    if (!w) continue
    const speed = Math.round(w.speed)
    fc.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { speed, dir: w.dir, label: String(speed), color: windColor(w.speed) },
    })
  }
  ;(map.getSource('wind-grid') as GeoJSONSource).setData(fc)
}

export function setSpotsData(map: MlMap, time: string) {
  const fc = empty()
  for (const s of SPOTS) {
    const r = rateSpot(s, valueAt(windCache.get(keyOf(s)), time))
    fc.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, color: r.color },
    })
  }
  ;(map.getSource('spots') as GeoJSONSource).setData(fc)
}

export function setLayerVisibility(map: MlMap, l: Layers) {
  const vis = (on: boolean) => (on ? 'visible' : 'none')
  map.setLayoutProperty('wind-arrows', 'visibility', vis(l.arrows))
  map.setLayoutProperty('wind-values', 'visibility', vis(l.values))
  // Values sit under the arrow, or on the point itself when arrows are hidden.
  map.setLayoutProperty('wind-values', 'text-offset', l.arrows ? [0, 1.15] : [0, 0])
  map.setLayoutProperty('spots-circle', 'visibility', vis(l.spots))
  map.setLayoutProperty('spots-label', 'visibility', vis(l.spots))
}
