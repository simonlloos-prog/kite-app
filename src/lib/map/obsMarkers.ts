import { Marker, type Map as MlMap } from 'maplibre-gl'
import { obsClock, spinSeconds, type Obs } from '../wind/obs'
import { fmtSpeed, sector, UNIT_LABEL, type Unit } from '../wind/units'
import { windColor } from '../wind/windColor'

/**
 * Stations as HTML markers: a fan of four crescent blades in the map's wind colour (a station at
 * 18 kn matches an 18 kn band), spinning faster with the wind, the direction as a dart at its
 * centre that does not spin (outside the fan, it was hard to see; in a white disc, too big), the value
 * beside it. The user's idea, in the spirit of Winds-Up's spinning stations, drawn our
 * own way. HTML rather than a map layer, for the CSS animation; there are only a dozen.
 * Off the current hour, they are greyed and still: a measurement says nothing about later.
 * Styles: MapView.svelte (.obs-marker).
 */

/**
 * Four thin crescent blades, hollowed on their trailing edge, around a white hub, filled with --wind (set per station). Drawn twice: a
 * white outline under the whole fan, then the blades on top, so it reads as one solid shape
 * (a stroke per blade drew white lines where they meet).
 */
const BLADES = [0, 90, 180, 270].map((a) => `<path d="M-3 -2 C-3.2 -8.5 0.8 -13 6.5 -14.5 C4.2 -11 3.4 -6 3 2" transform="rotate(${a})"/>`).join('')
const FAN = `<svg viewBox="-16 -16 32 32" aria-hidden="true"><g class="edge">${BLADES}</g><g class="body">${BLADES}</g></svg>`
/** Dart pointing up (north), notched at the back like a navigation arrow, turned to where the wind goes. */
const ARROW = `<svg viewBox="-7 -7 14 14" aria-hidden="true"><path d="M0 -5.8 L4.6 5.2 L0 2.6 L-4.6 5.2 Z"/></svg>`

interface Parts {
  marker: Marker
  el: HTMLButtonElement
  dir: HTMLElement
  fan: HTMLElement
  value: HTMLElement
  obs: Obs
}

const shown = new Map<string, Parts>()

function create(map: MlMap, o: Obs, onTap: (o: Obs) => void): Parts {
  const el = document.createElement('button')
  el.type = 'button'
  // The arrow after the fan, on top of it.
  el.innerHTML = `<span class="obs-fan">${FAN}</span><span class="obs-dir"><span>${ARROW}</span></span><span class="obs-val"></span>`
  const q = (c: string) => el.querySelector<HTMLElement>(c)!
  const parts: Parts = { marker: new Marker({ element: el }).setLngLat([o.lon, o.lat]).addTo(map), el, dir: q('.obs-dir'), fan: q('.obs-fan'), value: q('.obs-val'), obs: o }
  // Marker replaces the element's classes with its own: ours go back on afterwards.
  el.classList.add('obs-marker')
  // The map's own click would pick the point under the station instead.
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    onTap(parts.obs)
  })
  return parts
}

/** The map the markers are on: a new map (component remounted) starts from none. */
let onMap: MlMap | null = null

export function setObsMarkers(map: MlMap, obs: Obs[], opts: { live: boolean; visible: boolean; unit: Unit; onTap: (o: Obs) => void }) {
  if (map !== onMap) {
    for (const p of shown.values()) p.marker.remove()
    shown.clear()
    onMap = map
  }
  const keep = new Set(opts.visible ? obs.map((o) => o.id) : [])
  for (const [id, p] of shown) {
    if (!keep.has(id)) {
      p.marker.remove()
      shown.delete(id)
    }
  }
  if (!opts.visible) return
  for (const o of obs) {
    const p = shown.get(o.id) ?? create(map, o, opts.onTap)
    shown.set(o.id, p)
    p.obs = o
    p.marker.setLngLat([o.lon, o.lat])
    p.el.classList.toggle('dim', !opts.live)
    p.dir.firstElementChild!.setAttribute('style', `transform: rotate(${o.dir + 180}deg)`)
    p.fan.style.setProperty('--wind', windColor(o.speed))
    const spin = opts.live ? spinSeconds(o.speed) : 0
    // Only when it changes: rewriting the duration restarts the turn from zero.
    const duration = spin ? `${spin}s` : ''
    if (p.fan.style.animationDuration !== duration) p.fan.style.animationDuration = duration
    p.fan.classList.toggle('spin', spin > 0)
    const gust = o.gust != null ? `<small>${fmtSpeed(o.gust, opts.unit)}</small>` : ''
    p.value.innerHTML = opts.live ? `${fmtSpeed(o.speed, opts.unit)}${gust}` : `<small>${obsClock(o.time)}</small>`
    p.el.setAttribute(
      'aria-label',
      `${o.name} (${o.source}) : ${fmtSpeed(o.speed, opts.unit)} ${UNIT_LABEL[opts.unit]} ${sector(o.dir)}, mesuré à ${obsClock(o.time)}`,
    )
  }
}
