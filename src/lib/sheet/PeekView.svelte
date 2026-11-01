<script lang="ts">
  import { nearestSpot } from '../spots/spots'
  import { app } from '../stores/app.svelte'
  import { valueAt } from '../wind/openMeteo'
  import { formatHour } from '../wind/time'
  import { sector } from '../wind/units'
  import { windColor } from '../wind/windColor'

  const w = $derived(valueAt(app.target, app.selectedTime))
  const spot = $derived(nearestSpot(app.center))
  const place = $derived(spot?.name ?? `${app.center.lat.toFixed(3)}, ${app.center.lon.toFixed(3)}`)
</script>

<div class="peek">
  {#if w}
    <div class="speed" style:color={windColor(w.speed)}>
      {Math.round(w.speed)}<small>kn</small>
    </div>
    <div class="details">
      <div class="line">
        <svg class="arrow" viewBox="0 0 24 24" style:transform="rotate({w.dir + 180}deg)" aria-hidden="true">
          <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
        </svg>
        <strong>{sector(w.dir)}</strong>
        <span class="muted">{Math.round(w.dir)}°</span>
        <span class="gust">raf. {Number.isNaN(w.gust) ? '–' : Math.round(w.gust)} kn</span>
      </div>
      <div class="meta">{place}</div>
      <div class="meta">
        {formatHour(app.selectedTime)} · AROME HD
        {#if !app.online}<span class="badge">hors-ligne</span>{/if}
      </div>
    </div>
  {:else}
    <div class="details">
      <div class="line">
        {#if app.targetError}<span class="error">{app.targetError}</span>
        {:else if app.targetLoading}<span class="muted">Chargement AROME HD…</span>
        {:else}<span class="muted">Pas de donnée à cette heure</span>{/if}
      </div>
      <div class="meta">{place}</div>
    </div>
  {/if}
</div>

<style>
  .peek {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100px;
  }
  .speed {
    font: 800 52px/1 var(--font);
    letter-spacing: -2px;
    min-width: 80px;
    text-shadow: 0 0 1px rgb(0 0 0 / 0.4);
  }
  small {
    font-size: 15px;
    letter-spacing: 0;
    margin-left: 2px;
    color: var(--muted);
  }
  .details {
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 17px;
  }
  .arrow {
    width: 22px;
    height: 22px;
    color: var(--text);
  }
  .gust {
    margin-left: auto;
    font-weight: 600;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: #ef4444;
    font-size: 14px;
  }
  .badge {
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 6px;
    background: #f59e0b;
    color: #fff;
    font-size: 11px;
  }
</style>
