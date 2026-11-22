import type { Map as MlMap } from 'maplibre-gl'
import { ROW_SECONDS, STILL_ROWS, trainCrests, type Train } from '../wind/surf'

/**
 * Mix: the wave crests rolling in towards the beaches, drawn on a canvas laid over the map (above
 * the wind, under the HTML markers). Only the crests move, ~30 times a second: the trains are
 * computed once per view (surf.ts), and a GeoJSON layer redrawn that often would be heavy on a
 * phone. White foam on a blurred blue halo; still when the phone asks for less motion, and paused
 * while the app is hidden.
 */

let canvas: HTMLCanvasElement | null = null
let trains: Train[] = []
let frame = 0
let last = 0
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function ensureCanvas(map: MlMap): HTMLCanvasElement {
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.className = 'surf-canvas'
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' })
  // Right over the map's own canvas: under the stations' HTML markers, added after it.
  map.getCanvas().after(canvas)
  // Still or not, follow the map while it moves.
  map.on('move', () => still() && draw(map))
  map.on('resize', () => draw(map))
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run(map)))
  return canvas
}

function draw(map: MlMap, now = performance.now()) {
  const cv = canvas
  if (!cv) return
  const { clientWidth: w, clientHeight: h } = map.getCanvas()
  const ratio = devicePixelRatio || 1
  if (cv.width !== Math.round(w * ratio) || cv.height !== Math.round(h * ratio)) {
    cv.width = Math.round(w * ratio)
    cv.height = Math.round(h * ratio)
    cv.style.width = `${w}px`
    cv.style.height = `${h}px`
  }
  const ctx = cv.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (!trains.length) return
  const rows = still() ? STILL_ROWS : now / 1000 / ROW_SECONDS
  const degPx = 360 / (512 * 2 ** map.getZoom())
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const tr of trains) {
    const foot = map.project([tr.lon, tr.lat])
    if (foot.x < -60 || foot.x > w + 60 || foot.y < -60 || foot.y > h + 60) continue
    for (const { pts, alpha } of trainCrests(tr, rows, degPx)) {
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(foot.x + x, foot.y - y) : ctx.moveTo(foot.x + x, foot.y - y)))
      // Halo: two soft blue strokes (canvas blur filters are missing on iOS Safari), then the foam.
      ctx.strokeStyle = `rgba(13, 71, 161, ${0.25 * alpha})`
      ctx.lineWidth = tr.width + 7
      ctx.stroke()
      ctx.strokeStyle = `rgba(13, 71, 161, ${0.4 * alpha})`
      ctx.lineWidth = tr.width + 4
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.lineWidth = tr.width
      ctx.stroke()
    }
  }
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
}

function run(map: MlMap) {
  stop()
  if (!trains.length || still() || document.hidden) return draw(map)
  const tick = (now: number) => {
    // ~30 frames a second is smooth enough for slow crests, and half the work.
    if (now - last >= 30) {
      last = now
      draw(map, now)
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

/** The trains to roll in, or none (out of Mix). */
export function setSurfTrains(map: MlMap, next: Train[]) {
  ensureCanvas(map)
  trains = next
  run(map)
}
