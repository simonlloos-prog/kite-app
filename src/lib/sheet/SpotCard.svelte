<script lang="ts">
  import { rateSpot } from '../spots/rating'
  import { isOcean, windPointOf, type Spot } from '../spots/spots'
  import { rideableWindows, spotHours, windowLabel } from '../spots/timeline'
  import { app } from '../stores/app.svelte'
  import { nearestObs, obsClock } from '../wind/obs'
  import { tideLabel } from '../wind/tide'
  import { fmtSpeed, sector, sectorAngle, type Sector } from '../wind/units'
  import PiBadge from './PiBadge.svelte'
  import WaveLine from './WaveLine.svelte'

  /**
   * A tapped spot: how it works at the hour shown, when it works over the coming hours (a strip
   * coloured by its rating, tap an hour to go there), and on demand its full details (Info spot).
   */
  const { spot }: { spot: Spot } = $props()

  const point = $derived(windPointOf(spot))
  const w = $derived(app.windAt(point))
  const rating = $derived(rateSpot(spot, w, app.tide, app.selectedTime))
  const trend = $derived(app.gustTrendAt(point))
  const wave = $derived(isOcean(spot) ? app.waveAt(point) : null)
  const obs = $derived(app.obsLive ? nearestObs(point, app.obs) : null)
  const hours = $derived(
    spotHours(
      spot,
      app.times,
      (t) => app.windAtTime(point, t),
      (t) => app.tideAt(t),
    ),
  )
  const windows = $derived(rideableWindows(hours))
  const today = $derived(app.times[0]?.slice(0, 10) ?? '')
  let info = $state(false)

  // Strip: one bar per hour, its height the mean wind, its colour the spot's rating.
  const W = 320
  const H = 54
  const BOTTOM = 12 // Day names.
  const LEFT = 14 // Speed marks.
  const TOP_KN = 35
  const barW = $derived((W - LEFT) / Math.max(1, hours.length))
  const y = (kn: number) => H - BOTTOM - (Math.min(kn, TOP_KN) / TOP_KN) * (H - BOTTOM - 2)
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
  const dayName = (key: string) => dayFmt.format(Date.parse(`${key.slice(0, 10)}T12:00Z`))

  function jump(e: MouseEvent) {
    const { left, width } = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = ((e.clientX - left) / width) * W
    if (x >= LEFT) app.setTimeIndex(Math.floor((x - LEFT) / barW))
  }

  // Info spot: the 8 directions, coloured like the ratings.
  const ROSE: Sector[] = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  const quality = (s: Sector) =>
    spot.good.includes(s) ? '#22c55e' : spot.ok.includes(s) ? '#eab308' : spot.offshore.includes(s) ? '#dc2626' : 'var(--border)'
  const R = 34
  const C = 42
  const xy = (deg: number, r: number) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)]
  const at = (deg: number, r: number) => xy(deg, r).map((v) => v.toFixed(1)).join(',')
  const wedge = (s: Sector) => {
    const a = sectorAngle(s)
    return `M${at(a - 20, 9)} L${at(a - 20, R)} A${R} ${R} 0 0 1 ${at(a + 20, R)} L${at(a + 20, 9)} A9 9 0 0 0 ${at(a - 20, 9)}Z`
  }
</script>

<!-- The dial's swipe must not start from here. -->
<section class="card" aria-label="Spot {spot.name}" onpointerdown={(e) => e.stopPropagation()}>
  <header>
    <span class="dot" style:background={rating.color}></span>
    <b class="name">{spot.name}</b>
    <button
      type="button"
      class="fav"
      class:on={app.isFavorite(spot.id)}
      aria-pressed={app.isFavorite(spot.id)}
      aria-label={app.isFavorite(spot.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onclick={() => app.toggleFavorite(spot.id)}>{app.isFavorite(spot.id) ? '★' : '☆'}</button
    >
    <span class="label">{rating.label}</span>
    {#if trend}<PiBadge {trend} />{/if}
    <button type="button" class="more" aria-pressed={info} onclick={() => (info = !info)}>{info ? 'Prévision' : 'Info spot'}</button>
    <button type="button" class="close" aria-label="Fermer" onclick={() => (app.picked = null)}>✕</button>
  </header>

  {#if !info}
    {#if wave}<p class="line"><WaveLine {wave} /></p>{/if}
    {#if spot.tide !== undefined && app.tide}
      <p class="line">{tideLabel(app.tide)} · navigable à ±{spot.tide} h de la pleine mer</p>
    {/if}
    {#if obs}
      <p class="line muted">
        mesuré {fmtSpeed(obs.speed, app.unit)}{obs.gust != null ? ` raf. ${fmtSpeed(obs.gust, app.unit)}` : ''}
        {sector(obs.dir)} · {obs.name}, {obsClock(obs.time)}
      </p>
    {/if}

    <!-- Tap an hour: the dial goes there. -->
    <button type="button" class="strip" aria-label="Note du spot heure par heure ; toucher une heure pour y aller" onclick={jump}>
    <svg viewBox="0 0 {W} {H}" aria-hidden="true">
      {#each [12, 25] as kn (kn)}
        <line class="grid" x1={LEFT} x2={W} y1={y(kn)} y2={y(kn)} />
        <text class="axis" x={LEFT - 2} y={y(kn) + 3} text-anchor="end">{fmtSpeed(kn, app.unit)}</text>
      {/each}
      <!-- Night: a grey band behind, faded bars; never counted as a slot. -->
      {#each hours as h, i (h.time)}
        {#if !h.day}<rect class="night" x={LEFT + i * barW} width={barW + 0.2} y={0} height={H - BOTTOM} />{/if}
      {/each}
      {#each hours as h, i (h.time)}
        {#if h.w}
          <rect
            x={LEFT + i * barW + 0.3}
            width={barW - 0.6}
            y={y(h.w.speed)}
            height={H - BOTTOM - y(h.w.speed)}
            fill={h.rating.color}
            opacity={h.day ? 1 : 0.35}
          />
        {/if}
        {#if h.time.endsWith('T00:00')}
          <line class="day" x1={LEFT + i * barW} x2={LEFT + i * barW} y1={2} y2={H - 2} />
          <text class="axis" x={LEFT + i * barW + 2} y={H - 2}>{dayName(h.time)}</text>
        {/if}
      {/each}
      <rect class="now" x={LEFT + app.timeIndex * barW - 0.5} width={barW + 1} y={1} height={H - BOTTOM - 1} />
    </svg>
    </button>
    <p class="windows">
      {#if windows.length}
        <span class="muted">Navigable :</span>
        {windows.map((x) => windowLabel(x, today)).join(' · ')}
      {:else if hours.every((h) => h.w)}
        <span class="muted">Pas de créneau navigable de jour sur les {hours.length} h à venir</span>
      {:else}
        <span class="muted">Chargement des heures…</span>
      {/if}
    </p>
  {:else}
    <div class="info">
      <svg class="rose" viewBox="-4 -4 92 92" role="img" aria-label="Directions du vent : bonnes en vert, moyennes en jaune, offshore en rouge">
        {#each ROSE as s (s)}
          <path d={wedge(s)} fill={quality(s)} />
          {@const [lx, ly] = xy(sectorAngle(s), R + 6)}
          <text class="axis" x={lx} y={ly + 3} text-anchor="middle">{s}</text>
        {/each}
        {#if w}
          <path class="wind" d="M0 -9 L5 6 L0 3 L-5 6 Z" transform="translate({C} {C}) rotate({w.dir + 180})" />
        {/if}
      </svg>
      <dl>
        <dt>Niveau</dt>
        <dd>{spot.level} · {spot.area}</dd>
        {#if spot.tide !== undefined}
          <dt>Marée</dt>
          <dd>à ±{spot.tide} h de la pleine mer</dd>
        {/if}
        {#if spot.note}
          <dt>Règles</dt>
          <dd>{spot.note}</dd>
        {/if}
        {#if spot.danger}
          <dt>Dangers</dt>
          <dd class="danger">⚠ {spot.danger}</dd>
        {/if}
      </dl>
    </div>
  {/if}
</section>

<style>
  .card {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    box-sizing: border-box;
    padding: 6px 10px 8px;
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
    touch-action: pan-y;
  }
  /* Short screens (a phone's browser): the card stays right of the left buttons. */
  @media (max-height: 780px) {
    .card {
      left: 48px;
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    white-space: nowrap;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
    box-shadow: 0 0 0 2px #fff;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fav {
    flex: none;
    width: 36px;
    height: 44px;
    margin: -10px -8px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 19px;
    line-height: 1;
  }
  .fav.on {
    color: #f5b301;
  }
  .label {
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    height: 44px;
    margin: -10px -4px -10px auto;
    padding: 0 6px;
    border: 0;
    background: none;
    color: var(--accent);
    font: 600 13px var(--font);
    white-space: nowrap;
  }
  .close {
    width: 40px;
    height: 44px;
    margin: -10px -8px -10px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 16px;
  }
  .line,
  .windows {
    margin: 2px 0 0;
    font-size: 12px;
  }
  .muted {
    color: var(--muted);
  }
  .strip {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .strip svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 0.6;
  }
  .day {
    stroke: var(--muted);
    stroke-width: 0.6;
  }
  .axis {
    fill: var(--muted);
    font: 8px var(--font);
  }
  .night {
    fill: var(--border);
    opacity: 0.55;
  }
  .now {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
  }
  .info {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 4px;
  }
  .rose {
    width: 92px;
    flex: none;
  }
  .wind {
    fill: var(--text);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    margin: 0;
    font-size: 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .danger {
    color: #ea580c;
  }
</style>
