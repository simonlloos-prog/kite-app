<script lang="ts">
  import { AttributionControl, GeolocateControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre looks for its worker next to its own module, which Vite moves: give it the real URL.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  import { onMount } from 'svelte'
  import { app } from '../stores/app.svelte'
  import {
    addWindLayers,
    gridBounds,
    setBandsData,
    setLayerVisibility,
    setLinesData,
    setPickedData,
    setSpotsData,
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
      const spot = map.queryRenderedFeatures(e.point, { layers: ['spots-circle'] })[0]
      if (spot) {
        const [lon, lat] = (spot.geometry as GeoJSON.Point).coordinates
        app.picked = { lat, lon, name: spot.properties.name }
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
    const { meta, hour } = app
    if (ready && meta) setSpotsData(app.map!, meta.grid, hour)
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
    /* The visible page, exactly. On an installed iPhone app, 100vh/lvh is taller than what iOS
       draws: see the status-bar note in index.html. */
    position: fixed;
    inset: 0;
  }
  .map :global(.maplibregl-ctrl-top-right) {
    margin-top: env(safe-area-inset-top);
  }
</style>
