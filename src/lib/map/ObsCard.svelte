<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { bucketize, obsClock, type Obs, type ObsBucket } from '../wind/obs'
  import { fmtSpeed, sector, UNIT_LABEL } from '../wind/units'
  import { windColor } from '../wind/windColor'

  /** What a station measured lately: the last hour, or 8 on demand, when its source keeps them; its averages otherwise. */
  const { obs }: { obs: Obs } = $props()

  /** Chart settings: period, bar, arrow and hour-label steps in minutes. */
  const SHORT = { hours: 1, bucket: 2, arrow: 10, label: 15 }
  const LONG = { hours: 8, bucket: 15, arrow: 60, label: 120 }
  let long = $state(false)
  const view = $derived(long ? LONG : SHORT)
  const W = 320
  const H = 76 // Low enough to stay under the left buttons (⟳) on a phone.
  const TOP = 16 // Row of direction arrows.
  const BOTTOM = 14 // Hour labels.
  const LEFT = 20 // Speed labels.

  const id = $derived(obs.id)
  $effect(() => {
    const current = id
    app.loadHistory(current)
    const timer = setInterval(() => app.loadHistory(current), 30_000)
    return () => clearInterval(timer)
  })

  const history = $derived(app.obsHistory?.id === obs.id ? app.obsHistory : null)
  const points = $derived(history?.points ?? [])
  const end = $derived(points.at(-1)?.t ?? Date.now())
  const start = $derived(end - view.hours * 3_600_000)
  const minutes = $derived(view.bucket)
  const buckets = $derived(bucketize(points.filter((p) => p.t >= start), minutes))
  const arrows = $derived(bucketize(points.filter((p) => p.t >= start), view.arrow).filter((a) => a.t + (view.arrow * 60_000) / 2 >= start))
  const hasMore = $derived(points.some((p) => p.t < end - SHORT.hours * 3_600_000))

  const top = $derived(Math.max(10, ...buckets.map((b) => b.gust)) * 1.08)
  const step = $derived(top > 40 ? 20 : top > 20 ? 10 : 5)
  const levels = $derived(Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step))
  const ticks = $derived.by(() => {
    const size = view.label * 60_000
    const out: number[] = []
    for (let t = Math.ceil(start / size) * size; t <= end; t += size) out.push(t)
    return out
  })

  /** The first period starts before the chart: never draw over the speed labels. */
  const x = (t: number) => Math.max(LEFT, LEFT + ((t - start) / (end - start || 1)) * (W - LEFT))
  const y = (kn: number) => H - BOTTOM - (kn / top) * (H - TOP - BOTTOM)
  const width = (b: ObsBucket) => Math.max(1, x(b.t + minutes * 60_000) - x(b.t))
  const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' })
  const hourLabel = (t: number) => clock.format(new Date(t)).replace(':00', 'h').replace(':', 'h')
  const gustLine = $derived(buckets.map((b) => `${x(b.t + (minutes * 60_000) / 2).toFixed(1)},${y(b.gust).toFixed(1)}`).join(' '))

  const age = $derived(Math.max(0, Math.round((Date.now() - Date.parse(obs.time)) / 60_000)))
</script>

<!-- The dial's swipe must not start from here. -->
<section class="card" aria-label="Mesures de la station {obs.name}" onpointerdown={(e) => e.stopPropagation()}>
  <header>
    <span class="pill" style:background={windColor(obs.speed)}>{fmtSpeed(obs.speed, app.unit)}</span>
    <span class="now">
      {#if obs.gust != null}raf. {fmtSpeed(obs.gust, app.unit)}{/if}
      {UNIT_LABEL[app.unit]}
      <svg viewBox="0 0 24 24" style:transform="rotate({obs.dir + 180}deg)" aria-hidden="true"><path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" /></svg>
      {sector(obs.dir)}
    </span>
    {#if hasMore}
      <button type="button" class="more" onclick={() => (long = !long)}>{long ? 'Dernière heure' : 'Historique complet'}</button>
    {/if}
    <button type="button" class="close" aria-label="Fermer" onclick={() => (app.picked = null)}>✕</button>
  </header>
  <p class="who"><b>{obs.name}</b> · moyenne 10 min · {obsClock(obs.time)}{#if age > 1} (il y a {age} min){/if} · {obs.source}</p>

  {#if buckets.length > 1}
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Vent des {view.hours} dernières heures">
      {#each levels as l (l)}
        <line class="grid" x1={LEFT} x2={W} y1={y(l)} y2={y(l)} />
        <text class="axis" x={LEFT - 3} y={y(l) + 3} text-anchor="end">{fmtSpeed(l, app.unit)}</text>
      {/each}
      {#each buckets as b (b.t)}
        <rect x={x(b.t)} width={width(b) + 0.4} y={y(b.speed)} height={H - BOTTOM - y(b.speed)} fill={windColor(b.speed)} />
      {/each}
      <polyline class="gust" points={gustLine} />
      {#each arrows as a (a.t)}
        <path class="arrow" d="M0 -5 L3.6 4.5 L0 2.4 L-3.6 4.5 Z" transform="translate({x(a.t + (view.arrow * 60_000) / 2).toFixed(1)} 7) rotate({a.dir + 180})" />
      {/each}
      {#each ticks as t (t)}
        <text class="axis" x={x(t)} y={H - 3} text-anchor={x(t) > W - 12 ? 'end' : 'middle'}>{hourLabel(t)}</text>
      {/each}
    </svg>
  {:else if history?.windows.length}
    <div class="windows">
      {#each history.windows as w (w.label)}
        <div>
          <span class="pill" style:background={windColor(w.speed)}>{fmtSpeed(w.speed, app.unit)}</span>
          <small>{w.label}</small>
        </div>
      {/each}
    </div>
  {:else if history}
    <p class="none">Cette station ne donne que son dernier relevé.</p>
  {/if}
</section>

<style>
  .card {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    box-sizing: border-box;
    padding: 6px 10px;
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
    gap: 8px;
    font-size: 14px;
  }
  .pill {
    min-width: 30px;
    padding: 1px 7px;
    border-radius: 8px;
    color: #0b1320;
    font-weight: 800;
    text-align: center;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .now svg {
    width: 14px;
    height: 14px;
  }
  .close {
    width: 44px;
    height: 44px;
    margin: -10px -8px -10px 0;
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 16px;
  }
  .who {
    margin: 2px 0 6px;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who b {
    color: var(--text);
  }
  .chart {
    display: block;
    width: 100%;
    height: auto;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 0.6;
  }
  .axis {
    fill: var(--muted);
    font: 9px var(--font);
  }
  .gust {
    fill: none;
    stroke: var(--text);
    stroke-width: 1.2;
    stroke-linejoin: round;
    opacity: 0.85;
  }
  .more + .close {
    margin-left: 0;
  }
  .more {
    height: 44px;
    margin: -10px -6px -10px auto;
    padding: 0 6px;
    border: 0;
    background: none;
    color: var(--accent);
    font: 600 13px var(--font);
    white-space: nowrap;
  }
  .arrow {
    fill: var(--text);
  }
  .windows {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .windows div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .windows small,
  .none {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
</style>
