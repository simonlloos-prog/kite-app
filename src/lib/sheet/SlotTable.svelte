<script lang="ts">
  import { SPOTS, windPointOf, type Spot } from '../spots/spots'
  import { upcomingSlots, windowLabel, type Slot } from '../spots/timeline'
  import { app } from '../stores/app.svelte'
  import { fmtSpeed, UNIT_LABEL } from '../wind/units'

  /**
   * Every rideable daylight slot to come, all spots together, by day: « quand et où ». Spots with
   * the same hours share a row; tap a spot to see it on the map, at the slot's first hour.
   */
  let all = $state(false)
  const slots = $derived(
    upcomingSlots(
      SPOTS,
      app.times,
      (spot, t) => app.windAtTime(windPointOf(spot), t),
      (t) => app.tideAt(t),
      all ? 1 : 2,
    ),
  )
  const today = $derived(app.times[0]?.slice(0, 10) ?? '')
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const dayTitle = (d: string) => (d === today ? "Aujourd'hui" : dayFmt.format(Date.parse(`${d}T12:00Z`)))
  const days = $derived(
    Object.entries(
      slots.reduce<Record<string, Slot[]>>((acc, s) => {
        ;(acc[s.from.slice(0, 10)] ??= []).push(s)
        return acc
      }, {}),
    ),
  )
  // The hours, without the day already in the title.
  const hoursOf = (s: Slot) => windowLabel(s, s.from.slice(0, 10)).replace(/^auj\. /, '')
  const range = (s: Slot) => {
    const [a, b] = [fmtSpeed(s.minKn, app.unit), fmtSpeed(s.maxKn, app.unit)]
    return `${a === b ? a : `${a}–${b}`} ${UNIT_LABEL[app.unit]}`
  }
  const last = $derived(app.times.at(-1))
  const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
  const until = (key: string) => `${shortDay.format(Date.parse(`${key.slice(0, 10)}T12:00Z`))} ${Number(key.slice(11, 13))} h`
  const loading = $derived(app.loaded < app.times.length)

  function go(s: Slot, spot: Spot) {
    app.setTimeIndex(app.times.indexOf(s.from))
    app.flyTo({ ...spot, spot })
  }
</script>

<div class="table">
  <header>
    <h2>Prochains créneaux</h2>
    <div class="filter" role="group" aria-label="Créneaux affichés">
      <button type="button" aria-pressed={!all} onclick={() => (all = false)}>Bons</button>
      <button type="button" aria-pressed={all} onclick={() => (all = true)}>Tous</button>
    </div>
  </header>
  <p class="note">
    De jour, 2 h au moins{all ? ', léger ou direction moyenne compris' : ' : bon ou fort'}{last ? `, jusqu'à ${until(last)}` : ''}{loading ? ` · prévision en chargement (${app.loaded}/${app.times.length} h)` : ''}.
  </p>

  {#each days as [day, list] (day)}
    <h3>{dayTitle(day)}</h3>
    <ul>
      {#each list as s (s.from + s.to + s.best)}
        <li>
          <span class="dot" style:background={s.color}></span>
          <div class="slot">
            <div class="when">
              <b>{hoursOf(s)}</b>
              <span class="wind">{range(s)} · {s.dirFrom === s.dirTo ? s.dirFrom : `${s.dirFrom} → ${s.dirTo}`}</span>
            </div>
            <div class="spots">
              {#each s.spots as spot (spot.id)}
                <button type="button" onclick={() => go(s, spot)}>{spot.name}</button>
              {/each}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">
      {loading ? 'Prévision en chargement…' : `Aucun créneau ${all ? 'navigable' : 'bon ou fort'} de jour sur les heures à venir.`}
      {#if !all && !loading}<button type="button" class="link" onclick={() => (all = true)}>Voir tous les créneaux</button>{/if}
    </p>
  {/each}
</div>

<style>
  .table {
    padding: 4px 16px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-right: 40px; /* The sheet's ✕. */
  }
  h2 {
    font-size: 15px;
    margin: 8px 0;
  }
  .filter {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .filter button {
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 600 13px var(--font);
  }
  .filter button[aria-pressed='true'] {
    background: var(--text);
    color: var(--surface);
  }
  .note {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 12px;
  }
  h3 {
    margin: 12px 0 2px;
    font-size: 13px;
    text-transform: capitalize;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .dot {
    width: 12px;
    height: 12px;
    margin-top: 4px;
    border-radius: 50%;
    flex: none;
  }
  .slot {
    flex: 1;
    min-width: 0;
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 15px;
  }
  .wind {
    color: var(--muted);
    font-size: 13px;
  }
  .spots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .spots button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: none;
    color: var(--text);
    font: 14px var(--font);
  }
  .empty {
    color: var(--muted);
    font-size: 14px;
  }
  .link {
    display: block;
    margin-top: 6px;
    padding: 0;
    min-height: 44px;
    border: 0;
    background: none;
    color: #2563eb;
    font: 600 14px var(--font);
  }
</style>
