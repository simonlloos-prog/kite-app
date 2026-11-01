<script lang="ts">
  import { rateSpot } from '../spots/rating'
  import { SPOTS } from '../spots/spots'
  import { app } from '../stores/app.svelte'
  import { keyOf, windCache } from '../wind/cache'
  import { valueAt } from '../wind/openMeteo'
  import { formatHour } from '../wind/time'
  import { sector } from '../wind/units'
  import { windColor } from '../wind/windColor'

  const rows = $derived.by(() => {
    void app.cacheVersion
    return SPOTS.map((spot) => {
      const w = valueAt(windCache.get(keyOf(spot)), app.selectedTime)
      return { spot, w, rating: rateSpot(spot, w) }
    }).sort((a, b) => b.rating.score - a.rating.score || (b.w?.speed ?? 0) - (a.w?.speed ?? 0))
  })
</script>

<div class="full">
  <h2>Spots · {formatHour(app.selectedTime)}</h2>
  <ul>
    {#each rows as { spot, w, rating } (spot.id)}
      <li>
        <button type="button" onclick={() => app.flyTo(spot)}>
          <span class="dot" style:background={rating.color}></span>
          <span class="name">
            {spot.name}
            <small>{rating.label} · {spot.sectors.join(' ')}</small>
          </span>
          {#if w}
            <svg viewBox="0 0 24 24" style:transform="rotate({w.dir + 180}deg)" aria-hidden="true">
              <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
            </svg>
            <span class="dir">{sector(w.dir)}</span>
            <span class="kn" style:color={windColor(w.speed)}>{Math.round(w.speed)}</span>
            <span class="g">{Number.isNaN(w.gust) ? '–' : Math.round(w.gust)}</span>
          {:else}
            <span class="g">…</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .full {
    padding: 8px 16px;
  }
  h2 {
    font-size: 15px;
    margin: 8px 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    width: 100%;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    color: var(--text);
    font: 15px var(--font);
    text-align: left;
    padding: 6px 0;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
  }
  .name {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  small {
    color: var(--muted);
    font-size: 12px;
  }
  svg {
    width: 16px;
    height: 16px;
  }
  .dir {
    width: 32px;
    color: var(--muted);
    font-size: 13px;
  }
  .kn {
    width: 28px;
    text-align: right;
    font-weight: 800;
    font-size: 18px;
    text-shadow: 0 0 1px rgb(0 0 0 / 0.4);
  }
  .g {
    width: 26px;
    text-align: right;
    color: var(--muted);
    font-size: 13px;
  }
</style>
