<script lang="ts">
  import { AttributionControl, GeolocateControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre looks for its worker next to its own module, which Vite moves: give it the real URL.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  import { onMount } from 'svelte'
  import { SPOTS } from '../spots/spots'
  import { app } from '../stores/app.svelte'
  import type { Obs } from '../wind/obs'
  import { heightText, oceanCoast, surfLabels, surfTrains } from '../wind/surf'
  import { setObsMarkers } from './obsMarkers'
  import { setSurfTrains } from './surfCanvas'
  import { setRainField } from './rainCanvas'
  import {
    addWindLayers,
    gridBounds,
    setBandsData,
    setLayerVisibility,
    setLinesData,
    setSurfLabels,
    setObsData,
    setPickedData,
    setSpotsData,
    setTideData,
    STYLE_URL,
  } from './windLayers'

  let el: HTMLDivElement
  /** Reach of a tap around a spot's dot, screen pixels: a 44 px target, as for buttons. */
  const TAP_PX = 22
  let styleReady = $state(false)
  /** Wind layers exist: the style is loaded and the grid is known. */
  let ready = $state(false)

  setWorkerUrl(workerUrl)

  function trackView(map: MlMap) {
    const b = map.getBounds()
    app.zoom = map.getZoom()
    app.bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
  }

  onMount(() => {
    const map = new MlMap({
      container: el,
      style: STYLE_URL,
      center: [-1.2, 44.66],
      zoom: 11,
      // Beyond, an AROME cell (~1 km) fills the screen: a couple of flat bands and lone values.
      maxZoom: 13,
      // Added below, top right: in the bottom corner it hid under the phone's rounded edge.
      attributionControl: false,
    })
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right')
    // Basemap credits (OpenFreeMap / OpenStreetMap): required, under the locate button.
    map.addControl(new AttributionControl({ compact: true }), 'top-right')
    app.map = map

    map.on('load', () => {
      // Compact credits start expanded and would cover the legend: show only the ⓘ.
      el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      styleReady = true
      trackView(map)
    })
    map.on('moveend', () => trackView(map))
    map.on('click', (e) => {
      // Stations are HTML markers: their taps never reach here (pickStation).
      // A spot is a 14 px dot: a finger landing up to TAP_PX around it, or on its name, still picks
      // it (the nearest one when several are in reach).
      const { x, y } = e.point
      const near = map.queryRenderedFeatures(
        [
          [x - TAP_PX, y - TAP_PX],
          [x + TAP_PX, y + TAP_PX],
        ],
        { layers: ['spots-circle', 'spots-label'] },
      )
      const dist = (s: (typeof SPOTS)[number]) => {
        const p = map.project([s.lon, s.lat])
        return Math.hypot(p.x - x, p.y - y)
      }
      const s = near
        .map((f) => SPOTS.find((s) => s.id === f.properties.id))
        .filter((s) => s !== undefined)
        .sort((a, b) => dist(a) - dist(b))[0]
      // A wave height label: the waves' card, read where the label is (at sea).
      const label = s
        ? null
        : map.queryRenderedFeatures(
            [
              [x - TAP_PX, y - TAP_PX],
              [x + TAP_PX, y + TAP_PX],
            ],
            { layers: ['surf-label-sel', 'surf-labels'] },
          )[0]
      if (s) {
        app.picked = { lat: s.lat, lon: s.lon, name: s.name, area: s.area, windPoint: s.windPoint, spot: s }
      } else if (label?.geometry.type === 'Point') {
        const [lon, lat] = label.geometry.coordinates
        const { fromLon, fromLat } = label.properties
        app.picked = { lat, lon, name: 'vagues', wave: { lat: fromLat, lon: fromLon } }
      } else {
        app.picked = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      }
    })
    app.loadData()

    return () => {
      map.remove()
      app.map = null
    }
  })

  $effect(() => {
    if (styleReady && app.meta && !ready) {
      addWindLayers(app.map!)
      // Keep the view inside the data: no zooming out onto a blank edge.
      app.map!.setMaxBounds(gridBounds(app.meta.grid))
      ready = true
    }
  })

  // Wave crests along the ocean beaches, over the lighter wind.
  $effect(() => {
    if (!ready) return
    const { bounds, zoom } = app
    if (!bounds) {
      setSurfTrains(app.map!, [])
      return setSurfLabels(app.map!, [])
    }
    const trains = surfTrains(oceanCoast(), (p) => app.waveAt(p), zoom, bounds)
    setSurfTrains(app.map!, trains)
    const p = app.picked?.wave ? app.picked : null
    const w = p && app.waveAt(p.wave!)
    setSurfLabels(app.map!, surfLabels(trains, zoom), p && w ? { lon: p.lon, lat: p.lat, text: heightText(w.hs), from: p.wave! } : null)
  })

  $effect(() => {
    const { meta, hour } = app
    if (ready && meta && hour && app.layers.field) setBandsData(app.map!, meta.grid, app.hourFile ?? meta.run, app.selectedTime, hour, app.kind)
  })

  $effect(() => {
    const { meta, hour, bounds, zoom, unit } = app
    if (ready && meta && hour && bounds) setLinesData(app.map!, meta.grid, hour, app.kind, { zoom, bounds, unit })
  })

  // Rain of the selected hour, falling streaks (rainCanvas.ts), when switched on (☂).
  $effect(() => {
    const { meta, rainHour } = app
    if (ready && meta) setRainField(app.map!, app.layers.rain && rainHour ? { grid: meta.grid, rr: rainHour.rr, cape: rainHour.cape } : null)
  })

  $effect(() => {
    const { meta, hour, tide } = app
    // Favourites only (★ in the map settings): read here so the effect follows it.
    const fav = app.favOnly && app.favorites.length ? new Set(app.favorites) : null
    if (ready && meta) setSpotsData(app.map!, meta.grid, hour, tide, app.selectedTime, fav ? (id) => fav.has(id) : undefined)
  })

  $effect(() => {
    const { tide } = app
    if (ready) setTideData(app.map!, tide)
  })

  /** A greyed station (later hour) brings the dial back to now, where its measurement belongs. */
  function pickStation(o: Obs) {
    if (!app.obsLive) app.setTimeIndex(0)
    app.picked = { lat: o.lat, lon: o.lon, name: `station ${o.name}`, obs: o }
  }

  $effect(() => {
    const { obs, unit, obsLive } = app
    const visible = app.layers.obs
    if (!ready) return
    setObsData(app.map!, obs)
    setObsMarkers(app.map!, obs, { live: obsLive, visible, unit, onTap: pickStation })
  })

  $effect(() => {
    if (ready) setPickedData(app.map!, app.picked)
  })

  $effect(() => {
    const layers = { ...app.layers }
    if (ready) setLayerVisibility(app.map!, layers)
  })
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'ArrowRight') app.stepTime(1)
    if (e.key === 'ArrowLeft') app.stepTime(-1)
  }}
/>

<div class="map" bind:this={el}></div>

<style>
  .map {
    /* The whole screen, under the status bar too: see app.css and index.html. */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--page-h);
  }
  /* Stations (obsMarkers.ts): 44 px touch target, a 32 px fan of the wind colour with white
     edges and a soft dark outline (readable on every band), a dart arrow at its centre. Every
     part is a block: an inline span cannot rotate, which once left the fan still. */
  /* No position here: MapLibre's markers are absolutely positioned, which also holds the parts. */
  .map :global(.obs-marker) {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .map :global(.obs-marker > span) {
    position: absolute;
    display: block;
  }
  .map :global(.obs-marker svg) {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* Direction: a still dark dart at the centre of the fan, edged in white over the blades. */
  .map :global(.obs-dir) {
    left: 15px;
    top: 15px;
    width: 14px;
    height: 14px;
  }
  .map :global(.obs-dir > span) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .map :global(.obs-dir path) {
    fill: #0b1320;
    stroke: #fff;
    stroke-width: 1.3;
    stroke-linejoin: round;
    paint-order: stroke;
  }
  .map :global(.obs-fan) {
    left: 6px;
    top: 6px;
    width: 32px;
    height: 32px;
    filter: drop-shadow(0 0 0.6px #0b1320) drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35));
  }
  .map :global(.obs-fan.spin) {
    animation: obs-spin linear infinite;
  }
  .map :global(.obs-fan .edge path) {
    fill: #fff;
    stroke: #fff;
    stroke-width: 3;
    stroke-linejoin: round;
  }
  .map :global(.obs-fan .body path) {
    fill: var(--wind);
  }
  /* Off the current hour: the same fan, grey, smaller, still and without its arrow, so it reads
     as switched off (the user's idea). */
  .map :global(.obs-marker.dim) {
    filter: grayscale(1);
    opacity: 0.6;
  }
  .map :global(.obs-marker.dim .obs-fan) {
    transform: scale(0.7);
  }
  .map :global(.obs-marker.dim .obs-dir) {
    display: none;
  }
  @keyframes -global-obs-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .map :global(.obs-fan.spin) {
      animation: none;
    }
  }
  .map :global(.maplibregl-ctrl-top-right) {
    margin-top: env(safe-area-inset-top);
  }
  /* Open credits: the legend and the side buttons sit above the map, so keep the text clear of
     them, right of the buttons (64 px) and below the legend (--legend-h, set by Legend). The
     ⓘ stays in place (49 px down); only the text has a white box, starting 6 px under the
     legend (12 px down): a white box padded down from the ⓘ showed as a blank strip. */
  .map :global(.maplibregl-ctrl-attrib.maplibregl-compact-show) {
    box-sizing: border-box;
    max-width: calc(100vw - 74px);
    padding: 0 28px 0 0;
    background: none;
  }
  .map :global(.maplibregl-compact-show .maplibregl-ctrl-attrib-button) {
    background-color: #fff;
  }
  .map :global(.maplibregl-compact-show .maplibregl-ctrl-attrib-inner) {
    margin-top: max(0px, calc(var(--legend-h, 0px) - 31px));
    padding: 3px 8px;
    border-radius: 10px;
    background: #fff;
    box-shadow: var(--shadow);
  }
</style>
