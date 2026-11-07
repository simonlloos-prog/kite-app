<script lang="ts">
  import { AttributionControl, GeolocateControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre looks for its worker next to its own module, which Vite moves: give it the real URL.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  import { onMount } from 'svelte'
  import { SPOTS } from '../spots/spots'
  import { app } from '../stores/app.svelte'
  import type { Obs } from '../wind/obs'
  import { setObsMarkers } from './obsMarkers'
  import {
    addWindLayers,
    gridBounds,
    setBandsData,
    setLayerVisibility,
    setLinesData,
    setObsData,
    setPickedData,
    setSpotsData,
    setTideData,
    STYLE_URL,
  } from './windLayers'

  let el: HTMLDivElement
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
      const spot = map.queryRenderedFeatures(e.point, { layers: ['spots-circle'] })[0]
      const s = spot && SPOTS.find((s) => s.id === spot.properties.id)
      if (s) {
        app.picked = { lat: s.lat, lon: s.lon, name: s.name, windPoint: s.windPoint }
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

  $effect(() => {
    const bottom = app.mapPadBottom
    if (styleReady) app.map!.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 250 })
  })

  $effect(() => {
    const { meta, hour } = app
    if (ready && meta && hour && app.layers.field) setBandsData(app.map!, meta.grid, meta.run, app.selectedTime, hour, app.kind)
  })

  $effect(() => {
    const { meta, hour, bounds, zoom, unit } = app
    if (ready && meta && hour && bounds) setLinesData(app.map!, meta.grid, hour, app.kind, { zoom, bounds, unit })
  })

  $effect(() => {
    const { meta, hour, tide } = app
    if (ready && meta) setSpotsData(app.map!, meta.grid, hour, tide)
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
     edges and a soft dark outline (readable on every band), the arrow on the downwind side. Every
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
  .map :global(.obs-dir) {
    inset: 0;
  }
  .map :global(.obs-dir path) {
    fill: #0b1320;
    stroke: #fff;
    stroke-width: 2;
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
  .map :global(.obs-fan circle) {
    fill: #fff;
    stroke: #0b1320;
    stroke-width: 0.8;
  }
  .map :global(.obs-val) {
    right: 37px;
    top: 50%;
    transform: translateY(-50%);
    font: 800 13px var(--font);
    color: #0b1320;
    white-space: nowrap;
    text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff;
  }
  .map :global(.obs-val small) {
    margin-left: 3px;
    font-size: 10px;
    font-weight: 600;
  }
  .map :global(.obs-marker.dim) {
    filter: grayscale(1);
    opacity: 0.6;
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
