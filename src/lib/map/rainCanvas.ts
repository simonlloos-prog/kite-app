import type { Map as MlMap } from 'maplibre-gl'
import { cellOf, type Grid } from '../wind/arome'
import { RAIN_LEVELS, STORM_CAPE, STORM_RAIN } from '../wind/rain'

/**
 * Rain: short streaks falling where it rains, on a canvas over the map (like the wave crests,
 * surfCanvas.ts), more of them and faster when it rains harder. Each drop is pinned to a place on
 * the map, falls a few pixels, slanted, growing as it nears the ground, and ends in a small
 * splash. Where AROME sees a possible storm (STORM_CAPE and STORM_RAIN), a lightning bolt strikes
 * now and then. Off by default (rain button); still when the phone asks for less motion.
 */

interface Drop {
  lon: number
  lat: number
  /** Start time and length of its fall, ms. */
  t0: number
  dur: number
  level: number
}

/** Per level (light, moderate, heavy): share of drops kept, fall speed (px/s). */
const KEEP = [0.3, 0.6, 1]
const SPEED = [110, 160, 230]
/** Falling slant: a little leftwards, as if seen from above and slightly behind. */
const SLANT = { x: -0.3, y: 1 }
/** One drop per this many square pixels of screen, at most. */
const PX_PER_DROP = 650
const SPLASH_MS = 160

let canvas: HTMLCanvasElement | null = null
export interface RainField {
  grid: Grid
  rr: Float32Array
  cape: Float32Array
}

interface Bolt {
  lon: number
  lat: number
  t0: number
  /** Zigzag from the sky down to the place, px offsets. */
  path: [number, number][]
}

/** Mean time between two bolts on screen while storms are in view, ms. */
const BOLT_EVERY = 1400
const BOLT_MS = 260
/** Height of a bolt on screen, px. */
const BOLT_PX = 34

let field: RainField | null = null
let bolts: Bolt[] = []
let lastBolt = 0
let drops: Drop[] = []
let frame = 0
let last = 0
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const levelOf = (mm: number) => RAIN_LEVELS.reduce((l, min, i) => (mm >= min ? i + 1 : l), 0)

function ensureCanvas(map: MlMap): HTMLCanvasElement {
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.className = 'rain-canvas'
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' })
  map.getCanvas().after(canvas)
  map.on('move', () => still() && draw(map))
  map.on('resize', () => draw(map))
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run(map)))
  return canvas
}

/** A new drop somewhere it rains on screen, or null after a few misses (dry view). */
function spawn(map: MlMap, w: number, h: number, now: number): Drop | null {
  if (!field) return null
  for (let tries = 0; tries < 6; tries++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const { lng, lat } = map.unproject([x, y])
    const k = cellOf(field.grid, { lat, lon: lng })
    const level = k === null ? 0 : levelOf(field.rr[k])
    if (!level || Math.random() > KEEP[level - 1]) continue
    return { lon: lng, lat, t0: now - (still() ? 0 : Math.random() * 400), dur: 420 + Math.random() * 380, level }
  }
  return null
}

const isStorm = (f: RainField, k: number) => f.cape[k] >= STORM_CAPE && f.rr[k] >= STORM_RAIN

/** A bolt somewhere a storm is possible on screen, or null (no storm found). */
function strike(map: MlMap, w: number, h: number, now: number): Bolt | null {
  if (!field) return null
  for (let tries = 0; tries < 12; tries++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const { lng, lat } = map.unproject([x, y])
    const k = cellOf(field.grid, { lat, lon: lng })
    if (k === null || !isStorm(field, k)) continue
    const path: [number, number][] = [[0, -BOLT_PX]]
    for (let i = 1; i < 5; i++) path.push([(Math.random() - 0.5) * 12, -BOLT_PX + (i * BOLT_PX) / 5])
    path.push([0, 0])
    return { lon: lng, lat, t0: now, path }
  }
  return null
}

function drawBolts(ctx: CanvasRenderingContext2D, map: MlMap, w: number, h: number, now: number) {
  if (!still() && now - lastBolt > BOLT_EVERY * (0.4 + Math.random())) {
    lastBolt = now
    const b = strike(map, w, h, now)
    if (b) bolts.push(b)
  }
  bolts = bolts.filter((b) => now - b.t0 < BOLT_MS)
  // Still (less motion): one bolt per storm in view stays drawn.
  if (still() && !bolts.length) {
    const b = strike(map, w, h, now - BOLT_MS / 4)
    if (b) bolts.push(b)
  }
  for (const b of bolts) {
    const p = map.project([b.lon, b.lat])
    const age = still() ? BOLT_MS / 4 : now - b.t0
    // Two quick flashes, like real lightning.
    const alpha = age < 70 ? 1 : age < 120 ? 0.25 : Math.max(0, 1 - (age - 120) / (BOLT_MS - 120))
    const glow = ctx.createRadialGradient(p.x, p.y - BOLT_PX / 2, 0, p.x, p.y - BOLT_PX / 2, 45)
    glow.addColorStop(0, `rgba(255, 255, 230, ${0.45 * alpha})`)
    glow.addColorStop(1, 'rgba(255, 255, 230, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(p.x - 45, p.y - BOLT_PX / 2 - 45, 90, 90)
    ctx.beginPath()
    b.path.forEach(([dx, dy], i) => (i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)))
    ctx.strokeStyle = `rgba(23, 42, 82, ${0.7 * alpha})`
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 236, 120, ${alpha})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
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
  if (!field) return
  const max = Math.round((w * h) / PX_PER_DROP)
  while (drops.length < max) {
    const d = spawn(map, w, h, now)
    if (!d) break
    drops.push(d)
  }
  const norm = Math.hypot(SLANT.x, SLANT.y)
  const sx = SLANT.x / norm
  const sy = SLANT.y / norm
  ctx.lineCap = 'round'
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i]
    const age = still() ? d.dur / 2 : now - d.t0
    if (age > d.dur + SPLASH_MS) {
      const next = spawn(map, w, h, now)
      if (next) drops[i] = next
      else drops.splice(i--, 1)
      continue
    }
    const p = map.project([d.lon, d.lat])
    if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
      drops.splice(i--, 1)
      continue
    }
    const speed = SPEED[d.level - 1]
    // The drop falls onto its pinned place: from above it, getting there at the end.
    const f = Math.min(1, age / d.dur)
    const togo = ((1 - f) * speed * d.dur) / 1000
    const x = p.x - sx * togo
    const y = p.y - sy * togo
    if (age <= d.dur) {
      // Longer as it nears the ground: perspective, and speed.
      const len = (4 + 8 * f) * (0.8 + 0.25 * d.level)
      const alpha = Math.min(1, f * 4) * 0.85
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.moveTo(x - sx * len, y - sy * len)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.strokeStyle = `rgba(23, 42, 82, ${alpha})`
      ctx.lineWidth = 1.3
      ctx.stroke()
    } else {
      // Splash: a small ring, widening and fading.
      const s = (age - d.dur) / SPLASH_MS
      ctx.strokeStyle = `rgba(23, 42, 82, ${0.6 * (1 - s)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, 1.5 + 3 * s, 0.8 + 1.5 * s, 0, 0, 2 * Math.PI)
      ctx.stroke()
    }
  }
  drawBolts(ctx, map, w, h, now)
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
}

function run(map: MlMap) {
  stop()
  if (!field || still() || document.hidden) return draw(map)
  const tick = (now: number) => {
    if (now - last >= 30) {
      last = now
      draw(map, now)
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

/** The rain of the hour on screen, or none (rain off, or no rain file). */
export function setRainField(map: MlMap, next: RainField | null) {
  ensureCanvas(map)
  if (next?.rr !== field?.rr) {
    drops = []
    bolts = []
  }
  field = next
  run(map)
}
