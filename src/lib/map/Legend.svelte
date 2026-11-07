<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { DRY_HATCH, DRY_SAND } from './windLayers'
  import { staleHours } from '../wind/time'
  import { fmtSpeed, UNIT_LABEL } from '../wind/units'
  import { BINS } from '../wind/windColor'

  const LABELED = new Set([4, 8, 12, 16, 20, 25, 31, 40])
  const runHour = $derived(
    app.meta
      ? new Date(app.meta.run).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric' })
      : '',
  )

  // Clock for the "late" warning: the app may stay open for hours.
  let now = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(id)
  })
  const late = $derived(app.meta ? staleHours(app.meta.run, now) : null)

  // The open map credits start below the legend, whose height varies (run line, tide line).
  let height = $state(0)
  $effect(() => {
    document.documentElement.style.setProperty('--legend-h', `${height}px`)
    return () => document.documentElement.style.setProperty('--legend-h', '0px')
  })
</script>

{#if app.layers.field}
  <div class="legend" bind:clientHeight={height} aria-label="Échelle du vent en {UNIT_LABEL[app.unit]}">
    <span class="unit">{app.kind === 'gust' ? 'raf.' : 'moy.'} {UNIT_LABEL[app.unit]}</span>
    <!-- Values sit under the bar, centred on the boundary where their bin starts: inside the
         colour boxes they overflowed onto the next colour. -->
    <div class="scale">
      <div class="bar">
        {#each BINS as [min, color] (min)}
          <div class="bin" style:background={color}></div>
        {/each}
      </div>
      <div class="ticks">
        {#each BINS as [min], i (min)}
          {#if LABELED.has(min)}<span style:left="{(i / BINS.length) * 100}%">{fmtSpeed(min, app.unit)}</span>{/if}
        {/each}
      </div>
    </div>
    {#if app.meta}
      <span class="run">
        {app.meta.model} · run {runHour}{#if late}<b class="late"> · en retard ({late} h)</b>{/if}
      </span>
    {/if}
    {#if app.tide}
      <span class="dry">
        <i style:--sand={DRY_SAND} style:--hatch={DRY_HATCH}></i> à sec dans le Bassin (marée)
      </span>
    {/if}
    {#if app.layers.obs && app.obs.length}
      <!-- Off the current hour the stations are greyed: say why, they only measure now. -->
      <span class="dry obs">
        <i></i>
        {app.obsLive ? 'balises : vent mesuré en direct' : 'balises grisées : vent mesuré maintenant'}
      </span>
    {/if}
  </div>
{/if}

<style>
  .legend {
    position: fixed;
    top: calc(12px + env(safe-area-inset-top));
    left: 64px;
    right: 60px;
    max-width: 360px;
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
  .dry {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    font: 10px var(--font);
    color: var(--muted);
  }
  /* Same sand and hatching as on the map. */
  .dry i {
    width: 16px;
    height: 9px;
    border-radius: 2px;
    background: repeating-linear-gradient(-45deg, var(--hatch) 0 1px, var(--sand) 1px 4px);
  }
  /* Same ringed disc as the stations on the map (MapView.svelte). */
  .obs i {
    width: 9px;
    height: 9px;
    margin: 0 3px;
    border: 1.5px solid #fff;
    border-radius: 50%;
    background: #5fd83a;
    box-shadow: 0 0 0 1px #0b1320;
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
