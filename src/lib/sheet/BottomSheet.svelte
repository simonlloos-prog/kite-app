<script lang="ts">
  import { app, type Snap } from '../stores/app.svelte'
  import SpotList from './SpotList.svelte'
  import TimeBar from './TimeBar.svelte'

  const PEEK = 128
  const ORDER: Snap[] = ['peek', 'half', 'full']
  /** Finger travel for one hour when swiping horizontally. */
  const PX_PER_HOUR = 28
  /** Movement needed before deciding between a horizontal and a vertical drag. */
  const SLOP = 8

  let vh = $state(window.innerHeight)
  const heights = $derived<Record<Snap, number>>({
    peek: PEEK,
    half: Math.round(vh * 0.5),
    full: Math.round(vh * 0.9),
  })

  /** Visible height while dragging vertically, null otherwise. */
  let dragH = $state<number | null>(null)
  const visible = $derived(dragH ?? heights[app.snap])

  // The full sheet covers the map: keep the half padding so the map doesn't jump.
  $effect(() => {
    app.mapPadBottom = Math.min(heights[app.snap], heights.half)
  })

  let mode: 'idle' | 'pending' | 'h' | 'v' = 'idle'
  let startX = 0
  let startY = 0
  let startH = 0
  let startIndex = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0 // px/ms, positive = upwards

  function down(e: PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    mode = 'pending'
    startX = e.clientX
    startY = lastY = e.clientY
    lastT = e.timeStamp
    startH = visible
    startIndex = app.timeIndex
    velocity = 0
  }

  function move(e: PointerEvent) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (mode === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) > SLOP) mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'

    if (mode === 'h') {
      // Finger to the left moves forward in time, like turning pages.
      const before = app.selectedTime
      app.setTimeIndex(startIndex - Math.round(dx / PX_PER_HOUR))
      if (app.selectedTime !== before) navigator.vibrate?.(4)
    } else if (mode === 'v') {
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = (lastY - e.clientY) / dt
      lastY = e.clientY
      lastT = e.timeStamp
      dragH = Math.min(heights.full, Math.max(PEEK * 0.7, startH - dy))
    }
  }

  function up() {
    if (mode === 'pending') {
      // Tap: step up, and back to peek from full.
      app.snap = ORDER[(ORDER.indexOf(app.snap) + 1) % ORDER.length]
    } else if (mode === 'v' && dragH !== null) {
      const projected = dragH + velocity * 180
      app.snap = ORDER.reduce((a, b) => (Math.abs(heights[b] - projected) < Math.abs(heights[a] - projected) ? b : a))
    }
    mode = 'idle'
    dragH = null
  }
</script>

<svelte:window onresize={() => (vh = window.innerHeight)} />

<section
  class="sheet"
  class:dragging={dragH !== null}
  style:height="{heights.full}px"
  style:transform="translateY({heights.full - visible}px)"
>
  <div
    class="grab"
    role="slider"
    tabindex="0"
    aria-label="Heure de prévision"
    aria-valuemin={0}
    aria-valuemax={app.times.length - 1}
    aria-valuenow={app.timeIndex}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <div class="handle"></div>
    <TimeBar />
  </div>
  <div class="body" class:scroll={app.snap === 'full'}>
    <SpotList />
  </div>
</section>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
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
    touch-action: none;
    cursor: grab;
    padding: 8px 16px 0;
    user-select: none;
  }
  .handle {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--border);
    margin: 0 auto 6px;
  }
  .body {
    flex: 1;
    overflow: hidden;
    padding: 0 0 calc(16px + env(safe-area-inset-bottom));
  }
  .body.scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
