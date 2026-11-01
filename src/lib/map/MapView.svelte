<script lang="ts">
  import { GeolocateControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre looks for its worker next to its own module, which Vite moves: give it the real URL.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  import { onMount } from 'svelte'
  import { app } from '../stores/app.svelte'
  import {
    addWindLayers,
    setFieldData,
    setLayerVisibility,
    setPickedData,
    setPointsData,
    setSpotsData,
    STYLE_URL,
  } from './windLayers'

  let el: HTMLDivElement
  let ready = $state(false)

  setWorkerUrl(workerUrl)

  onMount(() => {
    const map = new MlMap({
      container: el,
      style: STYLE_URL,
      center: [-1.15, 44.68],
      zoom: 10.8,
      attributionControl: { compact: true },
    })
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right')
    app.map = map

    map.on('load', () => {
      addWindLayers(map)
      ready = true
      app.loadData()
    })
    map.on('click', (e) => {
      const spot = map.queryRenderedFeatures(e.point, { layers: ['spots-circle'] })[0]
      if (spot) {
        const [lon, lat] = (spot.geometry as GeoJSON.Point).coordinates
        app.picked = { lat, lon, name: spot.properties.name }
      } else {
        app.picked = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      }
    })

    return () => {
      map.remove()
      app.map = null
    }
  })

  $effect(() => {
    const bottom = app.mapPadBottom
    if (ready) app.map!.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 250 })
  })

  $effect(() => {
    if (ready && app.layers.field) setFieldData(app.map!, app.cacheVersion, app.selectedTime, app.kind)
  })

  $effect(() => {
    void app.cacheVersion
    if (ready) setPointsData(app.map!, app.selectedTime, app.kind)
  })

  $effect(() => {
    void app.cacheVersion
    if (ready) setSpotsData(app.map!, app.selectedTime)
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
    position: fixed;
    inset: 0;
  }
  .map :global(.maplibregl-ctrl-top-right) {
    margin-top: env(safe-area-inset-top);
  }
</style>
