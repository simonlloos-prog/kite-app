import { Marker, type Map as MlMap } from 'maplibre-gl'
import { obsClock, spinSeconds, type Obs } from '../wind/obs'
import { fmtSpeed, sector, UNIT_LABEL, type Unit } from '../wind/units'
import { windColor } from '../wind/windColor'

/**
 * Stations as HTML markers: a rotor spinning faster with the wind, in a disc of the map's wind
 * colour (a station at 18 kn matches an 18 kn band), an arrow on the downwind side, the value
 * beside it. HTML rather than a map layer, for the CSS animation; there are only a dozen.
 * Off the current hour, they are greyed and still: a measurement says nothing about later.
 * Styles: MapView.svelte (.obs-marker).
 */

const ROTOR = `<svg viewBox="-12 -12 24 24" aria-hidden="true">${[0, 120, 240]
  .map((a) => `<path d="M0 0 L0 -8.5" transform="rotate(${a})"/>`)
  .join('')}<circle r="2"/></svg>`
const ARROW = `<svg viewBox="-22 -22 44 44" aria-hidden="true"><path d="M0 -21 L6 -13 L-6 -13 Z"/></svg>`

interface Parts {
  marker: Marker
  el: HTMLButtonElement
  dir: HTMLElement
  disc: HTMLElement
  rotor: HTMLElement
  value: HTMLElement
  obs: Obs
}

const shown = new Map<string, Parts>()

function create(map: MlMap, o: Obs, onTap: (o: Obs) => void): Parts {
  const el = document.createElement('button')
  el.type = 'button'
  el.innerHTML = `<span class="obs-dir">${ARROW}</span><span class="obs-disc"><span class="obs-rotor">${ROTOR}</span></span><span class="obs-val"></span>`
  const q = (c: string) => el.querySelector<HTMLElement>(c)!
  const parts: Parts = { marker: new Marker({ element: el }).setLngLat([o.lon, o.lat]).addTo(map), el, dir: q('.obs-dir'), disc: q('.obs-disc'), rotor: q('.obs-rotor'), value: q('.obs-val'), obs: o }
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
    p.dir.style.transform = `rotate(${o.dir + 180}deg)`
    p.disc.style.background = windColor(o.speed)
    const spin = opts.live ? spinSeconds(o.speed) : 0
    p.rotor.style.animationDuration = spin ? `${spin}s` : ''
    p.rotor.classList.toggle('spin', spin > 0)
    const gust = o.gust != null ? `<small>${fmtSpeed(o.gust, opts.unit)}</small>` : ''
    p.value.innerHTML = opts.live ? `${fmtSpeed(o.speed, opts.unit)}${gust}` : `<small>${obsClock(o.time)}</small>`
    p.el.setAttribute(
      'aria-label',
      `${o.name} (${o.source}) : ${fmtSpeed(o.speed, opts.unit)} ${UNIT_LABEL[opts.unit]} ${sector(o.dir)}, mesuré à ${obsClock(o.time)}`,
    )
  }
}
