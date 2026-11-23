<script lang="ts">
  import { SPOTS, windPointOf, type Spot } from '../spots/spots'
  import { spotHours, spotSlots } from '../spots/timeline'
  import { app } from '../stores/app.svelte'
  import { fmtSpeed } from '../wind/units'

  /**
   * Full screen, over the map (☰): when and where to go. One row per spot, one column per day,
   * the spot's daylight slots in each cell. Tap a slot: the map, at its first hour.
   */
  let all = $state(false)

  const rows = $derived(
    SPOTS.map((spot) => {
      const hours = spotHours(
        spot,
        app.times,
        (t) => app.windAtTime(windPointOf(spot), t),
        (t) => app.tideAt(t),
      )
      const slots = spotSlots(hours, all ? 1 : 2)
      return { spot, slots, hours: slots.reduce((n, s) => n + s.hours, 0) }
    })
      .filter((r) => r.slots.length)
      // Most rideable hours first.
      .sort((a, b) => b.hours - a.hours || a.spot.name.localeCompare(b.spot.name)),
  )
  const today = $derived(app.times[0]?.slice(0, 10) ?? '')
  const days = $derived([...new Set(app.times.map((t) => t.slice(0, 10)))])
  const wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
  const dayName = (d: string) => (d === today ? 'Auj.' : wd.format(Date.parse(`${d}T12:00Z`)))
  const hourOf = (k: string) => Number(k.slice(11, 13))
  const loading = $derived(app.loaded < app.times.length)

  function go(spot: Spot, time: string) {
    app.setTimeIndex(app.times.indexOf(time))
    app.flyTo({ ...spot, spot })
  }
</script>

<div class="screen" role="dialog" tabindex="-1" aria-label="Où et quand" onpointerdown={(e) => e.stopPropagation()}>
  <header>
    <h2>Où et quand</h2>
    <div class="seg" role="group" aria-label="Créneaux affichés">
      <button type="button" aria-pressed={!all} onclick={() => (all = false)}>Bons</button>
      <button type="button" aria-pressed={all} onclick={() => (all = true)}>Tous</button>
    </div>
    <button type="button" class="close" aria-label="Fermer" onclick={() => (app.slotsOpen = false)}>✕</button>
  </header>

  <div class="body">
    <table>
      <thead>
        <tr>
          <th class="spot"></th>
          {#each days as d (d)}<th><b>{dayName(d)}</b> {Number(d.slice(8, 10))}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.spot.id)}
          <tr>
            <th class="spot">{r.spot.name}</th>
            {#each days as d (d)}
              <td>
                {#each r.slots.filter((s) => s.from.startsWith(d)) as s (s.from)}
                  <button type="button" class="slot" style:--c={s.color} onclick={() => go(r.spot, s.from)}>
                    <b>{hourOf(s.from)}–{hourOf(s.to) + 1} h</b>
                    <small>{fmtSpeed(s.maxKn, app.unit)} {s.dir}</small>
                  </button>
                {/each}
              </td>
            {/each}
          </tr>
        {:else}
          <tr>
            <td colspan={days.length + 1} class="empty">
              {#if loading}
                Prévision en chargement…
              {:else}
                Aucun créneau {all ? 'navigable' : 'bon ou fort'} de jour sur les heures à venir.
                {#if !all}<button type="button" class="link" onclick={() => (all = true)}>Voir tous les créneaux</button>{/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="foot">
    Créneaux de jour de 2 h au moins{all ? ', léger ou direction moyenne compris' : ', bon ou fort'} ; vent moyen max et
    direction. Toucher un créneau pour le voir sur la carte.{loading ? ` Prévision en chargement (${app.loaded}/${app.times.length} h).` : ''}
  </p>
</div>

<style>
  .screen {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: var(--page-h);
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 6px 16px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 17px;
  }
  .close {
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 20px;
  }
  .seg {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .seg button {
    min-height: 34px;
    padding: 0 11px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 600 13px var(--font);
  }
  .seg button[aria-pressed='true'] {
    background: var(--text);
    color: var(--surface);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    font-size: 13px;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    font-weight: 400;
    color: var(--muted);
    padding: 4px 2px;
    text-transform: capitalize;
  }
  th.spot {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--surface);
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    padding: 2px 6px 2px 10px;
    line-height: 1.15;
    border-bottom: 1px solid var(--border);
    width: 84px;
  }
  thead th.spot {
    z-index: 3;
    border-bottom: 0;
  }
  td {
    border-bottom: 1px solid var(--border);
    padding: 3px 2px;
    vertical-align: middle;
    text-align: center;
  }
  .slot {
    display: block;
    width: 100%;
    margin: 2px 0;
    padding: 3px 2px;
    border: 0;
    border-radius: 7px;
    background: var(--c);
    color: #0b1320;
    font: 13px var(--font);
    line-height: 1.1;
  }
  .slot small {
    display: block;
    font-size: 10px;
    font-weight: 600;
  }
  .link {
    display: block;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: #2563eb;
    font: 600 14px var(--font);
  }
  .empty {
    padding: 16px;
    color: var(--muted);
    text-align: left;
  }
  .foot {
    margin: 0;
    padding: 6px 16px;
    color: var(--muted);
    font-size: 11px;
    border-top: 1px solid var(--border);
  }
</style>
