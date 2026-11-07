<script lang="ts">
  import { rateSpot } from '../spots/rating'
  import { SPOTS, windPointOf } from '../spots/spots'
  import { app } from '../stores/app.svelte'
  import { nearestObs, obsClock } from '../wind/obs'
  import { formatHour } from '../wind/time'
  import { fmtSpeed, sector } from '../wind/units'
  import { windColor } from '../wind/windColor'
  import PiBadge from './PiBadge.svelte'

  const rows = $derived(
    SPOTS.map((spot) => {
      const w = app.windAt(windPointOf(spot))
      return {
        spot,
        w,
        rating: rateSpot(spot, w, app.tide),
        trend: app.gustTrendAt(windPointOf(spot)),
        obs: nearestObs(windPointOf(spot), app.obs),
      }
    }).sort((a, b) => b.rating.score - a.rating.score || (b.w?.speed ?? 0) - (a.w?.speed ?? 0)),
  )
  const piHour = $derived(
    app.piRun ? new Date(app.piRun).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric' }) : null,
  )
  const hourOf = (key: string) => `${Number(key.slice(11, 13))} h`
  const piSpan = $derived(app.piHours.length ? `de ${hourOf(app.piHours[0])} à ${hourOf(app.piHours.at(-1)!)}` : null)
</script>

<div class="list">
  <h2>Spots · {formatHour(app.selectedTime)}</h2>
  {#if piHour && piSpan}
    <p class="note">
      Badge PI : écart moyen des rafales entre AROME-PI (run de {piHour}) et AROME, {piSpan}. Il ne dépend pas de
      l'heure choisie : ↑ = rafales plus fortes prévues, ↓ = plus faibles, = écart sous 1,5 kn.
    </p>
  {/if}
  <ul>
    {#each rows as { spot, w, rating, trend, obs } (spot.id)}
      <li>
        <button type="button" onclick={() => app.flyTo(spot)}>
          <span class="dot" style:background={rating.color}></span>
          <span class="name">
            {spot.name}
            <small>
              {rating.label}
              {#if trend}<PiBadge {trend} />{/if}
            </small>
            {#if obs}
              <small class="measured">
                mesuré {fmtSpeed(obs.speed, app.unit)}{obs.gust != null ? ` raf. ${fmtSpeed(obs.gust, app.unit)}` : ''}
                {sector(obs.dir)} · station {obs.name}, {obsClock(obs.time)}
              </small>
            {/if}
            <small class="meta">
              {spot.level}{spot.tide ? ` · PM ±${spot.tide} h` : ''}{spot.note ? ` · ${spot.note}` : ''} · {spot.area}
            </small>
          </span>
          {#if w}
            <svg viewBox="0 0 24 24" style:transform="rotate({w.dir + 180}deg)" aria-hidden="true">
              <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
            </svg>
            <span class="dir">{sector(w.dir)}</span>
            <span class="kn" style:background={windColor(w.speed)}>{fmtSpeed(w.speed, app.unit)}</span>
            <span class="g">{fmtSpeed(w.gust, app.unit)}</span>
          {:else}
            <span class="g">…</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .list {
    padding: 4px 16px;
  }
  h2 {
    font-size: 15px;
    margin: 8px 0;
    text-transform: capitalize;
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
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .measured {
    display: block;
    color: var(--text);
  }
  .meta {
    display: block;
    font-size: 11px;
    opacity: 0.85;
  }
  .note {
    margin: -4px 0 6px;
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
    min-width: 30px;
    padding: 2px 4px;
    border-radius: 8px;
    text-align: center;
    color: #0b1320;
    font-weight: 800;
    font-size: 16px;
  }
  .g {
    width: 26px;
    text-align: right;
    color: var(--muted);
    font-size: 13px;
  }
</style>
