<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { formatHour, parisHourKey } from '../wind/time'
  import { windColor } from '../wind/windColor'

  const now = parisHourKey()
  const hours = $derived.by(() => {
    const s = app.target
    if (!s) return []
    return s.times
      .map((t, i) => ({ t, speed: s.speed[i], gust: s.gust[i], dir: s.dir[i] }))
      .filter((h) => h.t >= now && !Number.isNaN(h.speed))
  })

  let strip: HTMLDivElement | undefined = $state()
  $effect(() => {
    void hours
    strip?.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  })
</script>

<div class="half">
  <div class="head">
    <h2>Prévision sous la cible</h2>
    {#if app.selectedTime !== now}
      <button type="button" class="now" onclick={() => (app.selectedTime = now)}>Maintenant</button>
    {/if}
  </div>
  <div class="strip" bind:this={strip}>
    {#each hours as h (h.t)}
      <button type="button" class="hour" class:sel={h.t === app.selectedTime} onclick={() => (app.selectedTime = h.t)}>
        {#if h.t.endsWith('T00:00') || h.t === hours[0].t}
          <span class="day">{formatHour(h.t).split(' ')[0]}</span>
        {/if}
        <span class="h">{Number(h.t.slice(11, 13))}h</span>
        <svg viewBox="0 0 24 24" style:transform="rotate({h.dir + 180}deg)" aria-hidden="true">
          <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
        </svg>
        <span class="bar" style:height="{Math.min(60, h.speed * 1.6)}px" style:background={windColor(h.speed)}></span>
        <strong>{Math.round(h.speed)}</strong>
        <span class="g">{Number.isNaN(h.gust) ? '–' : Math.round(h.gust)}</span>
      </button>
    {:else}
      <p class="empty">Déplace la carte pour charger la prévision.</p>
    {/each}
  </div>
</div>

<style>
  .half {
    padding: 4px 0 8px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
  }
  h2 {
    font-size: 15px;
    margin: 8px 0;
  }
  .now {
    border: 0;
    border-radius: 10px;
    padding: 6px 10px;
    background: var(--accent);
    color: #fff;
    font: 600 13px var(--font);
  }
  .strip {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    padding: 0 12px;
    scrollbar-width: none;
  }
  .hour {
    flex: 0 0 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    height: 160px;
    padding: 4px 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: 13px var(--font);
  }
  .hour.sel {
    background: var(--selected);
  }
  .day {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }
  .h {
    color: var(--muted);
    font-size: 12px;
  }
  svg {
    width: 16px;
    height: 16px;
  }
  .bar {
    width: 14px;
    border-radius: 4px;
    margin-top: auto;
  }
  .g {
    color: var(--muted);
    font-size: 11px;
  }
  .empty {
    color: var(--muted);
    padding: 0 4px;
  }
</style>
