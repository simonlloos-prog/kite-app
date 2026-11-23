<script lang="ts">
  import { app } from '../stores/app.svelte'
  import type { GustTrend } from '../wind/pi'
  import { fmtSpeed, UNIT_LABEL } from '../wind/units'

  /**
   * The hourly AROME-PI run against AROME's gusts at this hour: a small trend line (the latest
   * forecast) and ↑ +3, ↓ −2 or =. Shown only for the hours AROME-PI covers.
   */
  let { trend }: { trend: GustTrend } = $props()

  const value = $derived(trend.trend === 'flat' ? '=' : `${trend.delta > 0 ? '+' : '−'}${fmtSpeed(Math.abs(trend.delta), app.unit)}`)
  const said = $derived(
    trend.trend === 'flat'
      ? 'la dernière prévision (AROME-PI, chaque heure) confirme les rafales'
      : `la dernière prévision (AROME-PI, chaque heure) donne des rafales ${trend.trend === 'up' ? 'plus fortes' : 'plus faibles'} de ${fmtSpeed(Math.abs(trend.delta), app.unit)} ${UNIT_LABEL[app.unit]}`,
  )
</script>

<span class="pi {trend.trend}" title={said} aria-label={said}>
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {#if trend.trend === 'up'}
      <path d="M2 12l4-4 3 2 5-5" /><path d="M10 5h4v4" />
    {:else if trend.trend === 'down'}
      <path d="M2 4l4 4 3-2 5 5" /><path d="M10 11h4V7" />
    {:else}
      <path d="M2 8.5l3-2 3 3 3-3 3 2" />
    {/if}
  </svg>
  {value}
</span>

<style>
  .pi {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 7px;
    font: 700 12px var(--font);
    white-space: nowrap;
    background: var(--selected);
    color: var(--muted);
  }
  svg {
    width: 14px;
    height: 14px;
  }
  .up {
    background: #fde4cf;
    color: #9a3412;
  }
  .down {
    background: #dbeafe;
    color: #1e40af;
  }
</style>
