<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { valueAt } from '../wind/openMeteo'
  import { formatHour } from '../wind/time'
  import { sector } from '../wind/units'
  import { windColor } from '../wind/windColor'

  const idx = $derived(app.timeIndex)
  const picked = $derived.by(() => {
    void app.cacheVersion
    const p = app.picked
    return p ? { name: p.name, w: valueAt(app.seriesAt(p), app.selectedTime) } : null
  })
</script>

<div class="bar">
  <div class="when">
    <span class="chev" class:off={idx <= 0}>‹</span>
    <div class="label">
      <strong>{formatHour(app.selectedTime)}</strong>
      <small>{idx <= 0 ? 'maintenant' : `dans ${idx} h`}</small>
    </div>
    <span class="chev" class:off={idx >= app.times.length - 1}>›</span>
  </div>

  <div class="ticks" aria-hidden="true">
    {#each app.times as t, i (t)}
      <i class:on={i === idx} class:day={t.endsWith('T00:00')}></i>
    {/each}
  </div>

  <div class="info">
    {#if app.error}
      <span class="error">{app.error}</span>
    {:else if app.loading && !app.times.length}
      Chargement AROME HD…
    {:else if picked?.w}
      {@const w = picked.w}
      <span class="pill" style:background={windColor(w.speed)}>{Math.round(w.speed)}</span>
      <span>raf. {Number.isNaN(w.gust) ? '–' : Math.round(w.gust)} kn</span>
      <svg viewBox="0 0 24 24" style:transform="rotate({w.dir + 180}deg)" aria-hidden="true">
        <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
      </svg>
      <span>{sector(w.dir)}</span>
      <span class="muted">· {picked.name ?? 'point touché'}</span>
    {:else if picked}
      <span class="muted">Hors de la zone AROME chargée</span>
    {:else}
      <span class="muted">Glisse ← → pour changer d'heure · touche la carte</span>
    {/if}
    {#if !app.online}<span class="badge">hors-ligne</span>{/if}
  </div>
</div>

<style>
  .bar {
    height: 104px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .when {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .chev {
    font-size: 30px;
    line-height: 1;
    color: var(--muted);
    width: 28px;
    text-align: center;
  }
  .chev.off {
    opacity: 0.2;
  }
  .label {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  strong {
    font-size: 24px;
    text-transform: capitalize;
  }
  small {
    color: var(--muted);
    font-size: 13px;
  }
  .ticks {
    display: flex;
    gap: 2px;
    height: 8px;
    align-items: flex-end;
  }
  .ticks i {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  .ticks i.day {
    height: 8px;
    background: var(--muted);
  }
  .ticks i.on {
    height: 8px;
    background: var(--accent);
  }
  .info {
    display: flex;
    align-items: center;
    gap: 6px;
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
  .badge {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 6px;
    background: #f59e0b;
    color: #fff;
    font-size: 11px;
  }
</style>
