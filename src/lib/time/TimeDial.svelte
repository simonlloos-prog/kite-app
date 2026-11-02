<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { tideLabel } from '../wind/tide'
  import { formatHour } from '../wind/time'
  import { fmtSpeed, sector, UNIT_LABEL } from '../wind/units'
  import { windColor } from '../wind/windColor'

  /** Finger travel for one hour. */
  const PX_PER_HOUR = 24
  /** Movement needed before a touch counts as a swipe rather than a tap. */
  const SLOP = 8

  const idx = $derived(app.timeIndex)
  const picked = $derived(
    app.picked ? { name: app.picked.name, w: app.windAt(app.picked), piGust: app.piGustAt(app.picked) } : null,
  )

  let el: HTMLDivElement
  let mode: 'idle' | 'pending' | 'swipe' = 'idle'
  let startX = 0
  let startY = 0
  let startIndex = 0

  /** Keep receiving the gesture outside the element; never let a failed capture block it. */
  function capture(node: Element, e: PointerEvent) {
    try {
      node.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already released.
    }
  }

  function setIndex(i: number) {
    const before = app.selectedTime
    app.setTimeIndex(i)
    if (app.selectedTime !== before) navigator.vibrate?.(4)
  }

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    mode = 'pending'
    startX = e.clientX
    startY = e.clientY
    startIndex = app.timeIndex
  }

  function move(e: PointerEvent) {
    if (mode === 'idle') return
    const dx = e.clientX - startX
    if (mode === 'pending' && Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(e.clientY - startY)) {
      mode = 'swipe'
      capture(el, e)
    }
    // Finger to the right moves forward in time.
    if (mode === 'swipe') setIndex(startIndex + Math.round(dx / PX_PER_HOUR))
  }

  function up(e: PointerEvent) {
    // A tap on the ticks jumps straight to that hour.
    const ticks = mode === 'pending' && (e.target as HTMLElement).closest('.ticks')
    if (ticks) {
      const { left, width } = ticks.getBoundingClientRect()
      setIndex(Math.floor(((e.clientX - left) / width) * app.times.length))
    }
    mode = 'idle'
  }

  /** Tap = one hour; hold = keeps going. */
  function repeat(node: HTMLButtonElement, step: number) {
    let timer = 0
    const stop = () => clearTimeout(timer)
    const tick = (delay: number) => {
      setIndex(app.timeIndex + step)
      timer = window.setTimeout(() => tick(110), delay)
    }
    const start = (e: PointerEvent) => {
      capture(node, e)
      tick(400)
    }
    // Keyboard activation: no pointer events, a plain click.
    const click = (e: MouseEvent) => e.detail === 0 && setIndex(app.timeIndex + step)
    node.addEventListener('pointerdown', start)
    node.addEventListener('click', click)
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) node.addEventListener(ev, stop)
    return { destroy: stop }
  }
</script>

<div
  class="dial"
  bind:this={el}
  role="slider"
  tabindex="-1"
  aria-label="Heure de prévision"
  aria-valuemin={0}
  aria-valuemax={app.times.length - 1}
  aria-valuenow={idx}
  aria-valuetext={formatHour(app.selectedTime)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={() => (mode = 'idle')}
>
  <div class="row">
    <button type="button" class="chev" disabled={idx <= 0} aria-label="Heure précédente" use:repeat={-1}>‹</button>
    <div class="label">
      <strong>{formatHour(app.selectedTime)}</strong>
      <small
        >{idx <= 0 ? 'maintenant' : `dans ${idx} h`}{#if app.tide}{` · ${tideLabel(app.tide)}`}{/if}</small
      >
    </div>
    <button type="button" class="chev" disabled={idx >= app.times.length - 1} aria-label="Heure suivante" use:repeat={1}
      >›</button
    >
  </div>

  <div class="ticks" aria-hidden="true">
    <!-- Tall tick + day name = midnight, small tick = noon, blue = selected hour. -->
    {#each app.times as t, i (t)}
      <i class:on={i === idx} class:day={t.endsWith('T00:00')} class:noon={t.endsWith('T12:00')}
        >{#if t.endsWith('T00:00')}<b>{formatHour(t).split(' ')[0]}</b>{/if}</i
      >
    {/each}
  </div>

  <div class="info">
    {#if app.error}
      <span class="error">{app.error}</span>
    {:else if !app.meta}
      <span class="muted">Chargement AROME…</span>
    {:else if !app.hour}
      <span class="muted">Chargement de cette heure… ({app.loaded}/{app.times.length})</span>
    {:else if picked?.w}
      {@const w = picked.w}
      <span class="pill" style:background={windColor(w.speed)}>{fmtSpeed(w.speed, app.unit)}</span>
      <span
        >raf. {fmtSpeed(w.gust, app.unit)}{#if picked.piGust != null && !Number.isNaN(picked.piGust)}<span
            class="pi"
            title="Rafale AROME-PI (run horaire)">&nbsp;(PI {fmtSpeed(picked.piGust, app.unit)})</span
          >{/if}
        {UNIT_LABEL[app.unit]}</span
      >
      <svg viewBox="0 0 24 24" style:transform="rotate({w.dir + 180}deg)" aria-hidden="true">
        <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
      </svg>
      <span>{sector(w.dir)}</span>
      <span class="muted">· {picked.name ?? 'point touché'}</span>
    {:else if picked}
      <span class="muted">Hors de la zone chargée</span>
    {:else}
      <span class="muted">Glisse → pour avancer · touche la carte</span>
    {/if}
    {#if app.meta && app.loaded < app.times.length}
      <span class="progress">{app.loaded}/{app.times.length} h</span>
    {/if}
    {#if !app.online}<span class="badge">hors-ligne</span>{/if}
  </div>
</div>

<style>
  .dial {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(calc(100vw - 24px), 440px);
    box-sizing: border-box;
    padding: 6px 8px 10px;
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
    touch-action: none;
    user-select: none;
    z-index: 2;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .chev {
    width: 52px;
    height: 48px;
    border: 0;
    border-radius: 12px;
    background: var(--selected);
    color: var(--text);
    font: 600 30px/1 var(--font);
    touch-action: none;
  }
  .chev:disabled {
    opacity: 0.3;
  }
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  strong {
    font-size: 22px;
    text-transform: capitalize;
  }
  small {
    color: var(--muted);
    font-size: 12px;
  }
  .ticks {
    display: flex;
    gap: 2px;
    height: 22px;
    align-items: center;
    margin: 4px 4px 12px;
    cursor: pointer;
  }
  .ticks i {
    position: relative;
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  .ticks i.noon {
    height: 7px;
  }
  .ticks i.day {
    height: 10px;
    background: var(--muted);
  }
  .ticks b {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 6px;
    font: 600 10px var(--font);
    color: var(--muted);
    text-transform: capitalize;
    white-space: nowrap;
    pointer-events: none;
  }
  .ticks i.on b {
    margin-top: 2px;
  }
  .ticks i.on {
    height: 14px;
    background: var(--accent);
  }
  .info {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
  }
  .pill {
    min-width: 28px;
    padding: 1px 6px;
    border-radius: 8px;
    color: #0b1320;
    font-weight: 800;
    text-align: center;
  }
  svg {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .muted {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .error {
    color: #ef4444;
  }
  .pi {
    color: var(--muted);
    font-size: 12px;
  }
  .progress {
    margin-left: auto;
    color: var(--muted);
    font-size: 11px;
  }
  .badge {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 6px;
    background: #f59e0b;
    color: #fff;
    font-size: 11px;
  }
</style>
