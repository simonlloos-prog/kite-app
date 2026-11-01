<script lang="ts">
  import { app, type Snap } from '../stores/app.svelte'
  import FullView from './FullView.svelte'
  import HalfView from './HalfView.svelte'
  import PeekView from './PeekView.svelte'

  const PEEK = 128
  const ORDER: Snap[] = ['peek', 'half', 'full']

  let vh = $state(window.innerHeight)
  const heights = $derived<Record<Snap, number>>({
    peek: PEEK,
    half: Math.round(vh * 0.5),
    full: Math.round(vh * 0.9),
  })

  /** Visible height while dragging, null otherwise. */
  let dragH = $state<number | null>(null)
  const visible = $derived(dragH ?? heights[app.snap])

  // The full sheet covers the map: keep the half padding so the map doesn't jump.
  $effect(() => {
    app.mapPadBottom = Math.min(heights[app.snap], heights.half)
  })

  let startY = 0
  let startH = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0 // px/ms, positive = upwards

  function down(e: PointerEvent) {
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
    dragH = Math.min(heights.full, Math.max(PEEK * 0.7, startH + startY - e.clientY))
  }

  function up(e: PointerEvent) {
    if (dragH === null) return
    if (Math.abs(e.clientY - startY) < 6) {
      // Tap on the header: step up, and back to peek from full.
      app.snap = ORDER[(ORDER.indexOf(app.snap) + 1) % ORDER.length]
    } else {
      const projected = dragH + velocity * 180
      app.snap = ORDER.reduce((a, b) => (Math.abs(heights[b] - projected) < Math.abs(heights[a] - projected) ? b : a))
    }
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
    aria-label="Panneau"
    aria-valuetext={app.snap}
    aria-valuenow={ORDER.indexOf(app.snap)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <div class="handle"></div>
    <PeekView />
  </div>
  <div class="body" class:scroll={app.snap === 'full'}>
    <HalfView />
    <FullView />
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
    margin: 0 auto 8px;
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
