<script lang="ts">
  import { GeolocateControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre looks for its worker next to its own module, which Vite moves: give it the real URL.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  import { onMount, untrack } from 'svelte'
  import { app } from '../stores/app.svelte'
  import { loadPoints } from '../wind/cache'
  import { gridPoints, pickStep } from '../wind/grid'
  import type { LatLon } from '../wind/openMeteo'
  import { addWindLayers, setGridData, setLayerVisibility, setSpotsData, STYLE_URL } from './windLayers'

  let el: HTMLDivElement
  let ready = $state(false)
  let grid = $state.raw<LatLon[]>([])
  let gridAbort: AbortController | null = null

  function visibleGrid(map: MlMap): LatLon[] {
    const b = map.getBounds()
    const { clientWidth: w, clientHeight: h } = map.getCanvas()
    const latStep = pickStep((b.getNorth() - b.getSouth()) / h)
    const lonStep = pickStep((b.getEast() - b.getWest()) / w)
    return gridPoints({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, latStep, lonStep)
  }

  async function refreshGrid() {
    const map = app.map
    if (!map || !ready || !(app.layers.values || app.layers.arrows)) return
    const pts = visibleGrid(map)
    grid = pts
    gridAbort?.abort()
    const ac = new AbortController()
    gridAbort = ac
    try {
      await loadPoints(pts, ac.signal)
      app.cacheVersion++
    } catch (e) {
      if (!ac.signal.aborted) console.warn('grid', e)
    }
  }

  setWorkerUrl(workerUrl)

  onMount(() => {
    const map = new MlMap({
      container: el,
      style: STYLE_URL,
      center: [app.center.lon, app.center.lat],
      zoom: 11,
      attributionControl: { compact: true },
    })
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right')
    app.map = map

    let t = 0
    const emitCenter = () => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        const c = map.getCenter()
        app.setCenter({ lat: c.lat, lon: c.lng })
      }, 250)
    }
    map.on('move', emitCenter)
    map.on('moveend', refreshGrid)
    map.on('load', () => {
      addWindLayers(map)
      ready = true
      emitCenter()
      refreshGrid()
      app.loadSpots()
    })
    map.on('click', 'spots-circle', (e) => {
      const [lon, lat] = (e.features![0].geometry as GeoJSON.Point).coordinates
      app.flyTo({ lat, lon })
    })

    return () => {
      clearTimeout(t)
      gridAbort?.abort()
      map.remove()
      app.map = null
    }
  })

  // Keep the reticle centred in the part of the map the sheet leaves visible.
  $effect(() => {
    const bottom = app.mapPadBottom
    if (ready) app.map!.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 250 })
  })

  $effect(() => {
    void app.cacheVersion
    if (ready) setGridData(app.map!, grid, app.selectedTime)
  })

  $effect(() => {
    void app.cacheVersion
    if (ready) setSpotsData(app.map!, app.selectedTime)
  })

  $effect(() => {
    const layers = { ...app.layers }
    if (!ready) return
    setLayerVisibility(app.map!, layers)
    untrack(refreshGrid)
  })
</script>

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
