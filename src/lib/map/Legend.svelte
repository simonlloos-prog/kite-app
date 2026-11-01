<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { BINS } from '../wind/windColor'

  const LABELED = new Set([4, 8, 12, 16, 20, 25, 31, 40])
  const runHour = $derived(
    app.meta
      ? new Date(app.meta.run).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric' })
      : '',
  )
</script>

{#if app.layers.field}
  <div class="legend" aria-label="Échelle du vent en nœuds">
    <span class="unit">{app.kind === 'gust' ? 'raf.' : 'moy.'} kn</span>
    <div class="scale">
      {#each BINS as [min, color] (min)}
        <div class="bin" style:background={color}>
          {#if LABELED.has(min)}<span>{min}</span>{/if}
        </div>
      {/each}
    </div>
    {#if app.meta}<span class="run">{app.meta.model} · run {runHour}</span>{/if}
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
  .scale {
    flex: 1;
    display: flex;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
    outline: 1px solid var(--border);
  }
  .bin {
    flex: 1;
    position: relative;
  }
  .bin span {
    position: absolute;
    left: 1px;
    top: 0;
    font: 700 10px/16px var(--font);
    color: #0b1320;
  }
</style>
