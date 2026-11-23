<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { runProgress } from '../wind/arome'
  import { staleHours } from '../wind/time'
  import { fmtSpeed, UNIT_LABEL } from '../wind/units'
  import { BINS } from '../wind/windColor'

  const LABELED = new Set([4, 8, 12, 16, 20, 25, 31, 40])
  const hourOfRun = (run: string) =>
    new Date(run).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric' })
  const runHour = $derived(app.meta ? hourOfRun(app.meta.run) : '')
  const bins = BINS
  const tick = (min: number) => (LABELED.has(min) ? fmtSpeed(min, app.unit) : null)

  // Clock for the "late" warning: the app may stay open for hours.
  let now = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(id)
  })
  const late = $derived(app.meta ? staleHours(app.meta.run, now) : null)
  const progress = $derived(app.meta ? runProgress(app.meta) : null)

  // The open map credits start below the legend, whose height varies (run line).
  let height = $state(0)
  $effect(() => {
    document.documentElement.style.setProperty('--legend-h', `${height}px`)
    return () => document.documentElement.style.setProperty('--legend-h', '0px')
  })
</script>

{#if app.layers.field}
  <div
    class="legend"
    bind:clientHeight={height}
    aria-label={`Échelle du vent en ${UNIT_LABEL[app.unit]}`}
  >
    <span class="unit">{`${app.kind === 'gust' ? 'raf.' : 'moy.'} ${UNIT_LABEL[app.unit]}`}</span>
    <!-- Values sit under the bar, centred on the boundary where their bin starts: inside the
         colour boxes they overflowed onto the next colour. -->
    <div class="scale">
      <div class="bar">
        {#each bins as [min, color] (min)}
          <div class="bin" style:background={color}></div>
        {/each}
      </div>
      <div class="ticks">
        {#each bins as [min], i (min)}
          {#if tick(min)}<span style:left="{(i / bins.length) * 100}%">{tick(min)}</span>{/if}
        {/each}
      </div>
    </div>
    {#if app.meta}
      <span class="run">
        {app.meta.model} · run {runHour}{#if progress !== null}{` · en cours (jusqu'à +${progress} h)`}{/if}{#if late}<b class="late"> · en retard ({late} h)</b>{/if}
      </span>
    {/if}
  </div>
{/if}

<style>
  .legend {
    position: fixed;
    top: calc(12px + env(safe-area-inset-top));
    /* The same 10 px gap to the left buttons (10 + 44 px) and to the geolocation button on the
       right (10 + 29 px); centred in that space when wider than 360 px. */
    left: 64px;
    right: 49px;
    max-width: 360px;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 6px;
    padding: 4px 8px;
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow);
    z-index: 2;
    pointer-events: none;
  }
  .unit {
    font: 600 11px var(--font);
    color: var(--muted);
    white-space: nowrap;
  }
  .run {
    flex-basis: 100%;
    font: 10px var(--font);
    color: var(--muted);
  }
  .late {
    color: #ea580c;
  }
  .scale {
    flex: 1;
    min-width: 0;
    padding: 0 6px;
  }
  .bar {
    display: flex;
    height: 10px;
    border-radius: 3px;
    overflow: hidden;
    outline: 1px solid var(--border);
  }
  .bin {
    flex: 1;
  }
  .ticks {
    position: relative;
    height: 13px;
  }
  .ticks span {
    position: absolute;
    top: 1px;
    transform: translateX(-50%);
    font: 700 10px/12px var(--font);
    color: var(--text);
  }
</style>
