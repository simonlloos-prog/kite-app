<script lang="ts">
  import type { LatLon } from '../wind/arome'
  import { app } from '../stores/app.svelte'
  import { fmtWave, SYSTEMS, wavePower } from '../wind/wave'
  import { sector } from '../wind/units'

  /**
   * A tapped wave-height label: the sea there at the hour shown (height, peak period, direction,
   * power), its wave systems (swell, wind sea, secondary swell), and the height over the coming
   * hours (tap an hour to go there).
   */
  const { at }: { at: LatLon } = $props()

  const wave = $derived(app.waveAt(at))
  const hours = $derived(app.times.map((t) => ({ t, w: app.waveAtTime(at, t) })))
  const systems = $derived(wave?.systems ? SYSTEMS.filter((s) => wave.systems![s.key]).map((s) => ({ ...s, ...wave.systems![s.key]! })) : [])
  const m = (v: number) => v.toFixed(1).replace('.', ',')
  const kw = (v: number) => (v < 10 ? m(v) : String(Math.round(v)))

  // Strip: one bar per hour, its height the waves' height.
  const W = 320
  const H = 50
  const BOTTOM = 12 // Day names.
  const LEFT = 18 // Height marks.
  const top = $derived(Math.max(2, Math.ceil(Math.max(0, ...hours.map((h) => h.w?.hs ?? 0)))))
  const marks = $derived(top <= 3 ? [1, 2] : top <= 6 ? [2, 4] : [3, 6])
  const barW = $derived((W - LEFT) / Math.max(1, hours.length))
  const y = (hs: number) => H - BOTTOM - (Math.min(hs, top) / top) * (H - BOTTOM - 2)
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
  const dayName = (key: string) => dayFmt.format(Date.parse(`${key.slice(0, 10)}T12:00Z`))

  function jump(e: MouseEvent) {
    const { left, width } = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = ((e.clientX - left) / width) * W
    if (x >= LEFT) app.setTimeIndex(Math.floor((x - LEFT) / barW))
  }
</script>

{#snippet arrow(dir: number)}
  <svg class="arrow" viewBox="0 0 24 24" style:transform="rotate({dir + 180}deg)" aria-hidden="true">
    <path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" />
  </svg>
{/snippet}

<!-- The dial's swipe must not start from here. -->
<section class="card" aria-label="Vagues" onpointerdown={(e) => e.stopPropagation()}>
  <header>
    <b>Vagues</b>
    {#if wave}<span class="big">{m(wave.hs)} m</span>{/if}
    <button type="button" class="close" aria-label="Fermer" onclick={() => (app.picked = null)}>✕</button>
  </header>

  {#if wave}
    <p class="line">
      {fmtWave(wave)}{@render arrow(wave.dir)}
      <span class="muted">· puissance {kw(wavePower(wave))} kW/m</span>
    </p>
    {#if systems.length}
      <table>
        <tbody>
          {#each systems as s (s.key)}
            <tr>
              <th>{s.label}</th>
              <td>{m(s.hs)} m</td>
              <td>{Math.round(s.tp)} s</td>
              <td class="dir">{sector(s.dir)}{@render arrow(s.dir)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="note">
      Hauteur des vagues (moyenne du tiers le plus haut), période de pic, direction des vagues dominantes
      {systems.length ? ' ; par type de vagues, période moyenne' : ''}. La flèche montre où vont les vagues. MFWAM, Météo-France.
    </p>
  {:else}
    <p class="line muted">Pas de vagues à cette heure ici.</p>
  {/if}

  <!-- Tap an hour: the dial goes there. -->
  <button type="button" class="strip" aria-label="Hauteur des vagues heure par heure ; toucher une heure pour y aller" onclick={jump}>
    <svg viewBox="0 0 {W} {H}" aria-hidden="true">
      {#each marks as v (v)}
        <line class="grid" x1={LEFT} x2={W} y1={y(v)} y2={y(v)} />
        <text class="axis" x={LEFT - 2} y={y(v) + 3} text-anchor="end">{v} m</text>
      {/each}
      {#each hours as h, i (h.t)}
        {#if h.w}
          <rect class="bar" x={LEFT + i * barW + 0.3} width={barW - 0.6} y={y(h.w.hs)} height={H - BOTTOM - y(h.w.hs)} />
        {/if}
        {#if h.t.endsWith('T00:00')}
          <line class="day" x1={LEFT + i * barW} x2={LEFT + i * barW} y1={2} y2={H - 2} />
          <text class="axis" x={LEFT + i * barW + 2} y={H - 2}>{dayName(h.t)}</text>
        {/if}
      {/each}
      <rect class="now" x={LEFT + app.timeIndex * barW - 0.5} width={barW + 1} y={1} height={H - BOTTOM - 1} />
    </svg>
  </button>
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
    align-items: baseline;
    gap: 8px;
    font-size: 14px;
  }
  .big {
    font-size: 17px;
    font-weight: 800;
    color: #1d6fd8;
  }
  .close {
    width: 40px;
    height: 44px;
    margin: -10px -8px -10px auto;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 16px;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin: 0;
    font-size: 13px;
  }
  .muted {
    color: var(--muted);
  }
  .arrow {
    width: 13px;
    height: 13px;
    flex: none;
  }
  table {
    margin: 4px 0 0;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    font-weight: 400;
    color: var(--muted);
    padding: 1px 10px 1px 0;
  }
  td {
    padding: 1px 8px 1px 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td.dir {
    display: flex;
    align-items: center;
    gap: 4px;
    text-align: left;
  }
  .note {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.3;
  }
  .strip {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: none;
  }
  .strip svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .bar {
    fill: #3b82f6;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
  }
  .day {
    stroke: var(--muted);
    stroke-width: 0.6;
  }
  .axis {
    fill: var(--muted);
    font-size: 8px;
  }
  .now {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.2;
  }
</style>
