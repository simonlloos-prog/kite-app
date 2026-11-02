<script lang="ts">
  import { app, type Snap } from '../stores/app.svelte'
  import SpotList from './SpotList.svelte'


  /** Page height: 100vh (app.css), which iOS may report taller than innerHeight. */
  const pageHeight = () => document.documentElement.getBoundingClientRect().height
  let vh = $state(pageHeight())
  const heights = $derived<Record<Snap, number>>({
    closed: 0,
    half: Math.round(vh * 0.5),
    full: Math.round(vh * 0.9),
  })

  /** Visible height while dragging, null otherwise. */
  let dragH = $state<number | null>(null)
  const visible = $derived(dragH ?? heights[app.snap])

  // No padding for the floating time dial: maxBounds ignores padding, so a bottom padding
  // let the screen bottom slide past the data and show a strip with no wind.
  // The full sheet covers the map: keep the half padding so the map doesn't jump.
  $effect(() => {
    app.mapPadBottom = app.snap === 'closed' ? 0 : heights.half
  })

  let startY = 0
  let startH = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0 // px/ms, positive = upwards

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startY = lastY = e.clientY
    lastT = e.timeStamp
    startH = visible
    velocity = 0
    dragH = startH
  }

  function move(e: PointerEvent) {
    if (dragH === null) return
    const dt = e.timeStamp - lastT
    if (dt > 0) velocity = (lastY - e.clientY) / dt
    lastY = e.clientY
    lastT = e.timeStamp
    dragH = Math.min(heights.full, Math.max(0, startH + startY - e.clientY))
  }

  function up(e: PointerEvent) {
    if (dragH === null) return
    if (Math.abs(e.clientY - startY) < 6) {
      app.snap = app.snap === 'half' ? 'full' : 'half'
    } else {
      const projected = dragH + velocity * 180
      const order: Snap[] = ['closed', 'half', 'full']
      app.snap = order.reduce((a, b) => (Math.abs(heights[b] - projected) < Math.abs(heights[a] - projected) ? b : a))
    }
    dragH = null
  }
</script>

<svelte:window onresize={() => (vh = pageHeight())} />

<section
  class="sheet"
  class:dragging={dragH !== null}
  aria-hidden={app.snap === 'closed'}
  style:height="{heights.full}px"
  style:top="calc(100vh - {heights.full}px)"
  style:transform="translateY({heights.full - visible + (visible ? 0 : 24)}px)"
>
  <div class="grab" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    <div class="handle"></div>
    <button type="button" class="close" aria-label="Fermer la liste" onclick={() => (app.snap = 'closed')}>✕</button>
  </div>
  <!-- Always scrollable. The sheet is full height and slid down, so its bottom is off screen
       at "half": the padding lets the last spots scroll up into view. -->
  <div class="body" style:padding-bottom="calc({16 + heights.full - visible}px + env(safe-area-inset-bottom))">
    <SpotList />
  </div>
</section>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    /* top: set inline, from the 100vh page (app.css). */
    z-index: 3;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -4px 24px rgb(0 0 0 / 0.18);
    transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: transform;
  }
  .sheet.dragging {
    transition: none;
  }
  .grab {
    position: relative;
    height: 28px;
    touch-action: none;
    cursor: grab;
  }
  .handle {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--border);
    margin: 10px auto 0;
  }
  .close {
    position: absolute;
    right: 8px;
    top: 2px;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 18px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
