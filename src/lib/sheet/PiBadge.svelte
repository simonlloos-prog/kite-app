<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { piSentence, type GustTrend } from '../wind/pi'
  import { fmtSpeed } from '../wind/units'

  /**
   * The hourly AROME-PI run against AROME's gusts at this hour: a small trend line (the latest
   * forecast) and +3, −2 or =. Shown only for the hours AROME-PI covers; a tap toggles the full
   * sentence, which the parent shows (a phone has no hover tooltip).
   */
  let { trend, open = false, ontoggle }: { trend: GustTrend; open?: boolean; ontoggle?: () => void } = $props()

  const value = $derived(trend.trend === 'flat' ? '=' : `${trend.delta > 0 ? '+' : '−'}${fmtSpeed(Math.abs(trend.delta), app.unit)}`)
</script>

<button type="button" class="pi {trend.trend}" aria-expanded={open} aria-label={piSentence(trend, app.unit)} onclick={ontoggle}>
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
</button>

<style>
  .pi {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    /* A bigger finger target than the chip itself. */
    margin: -8px 0;
    padding: 9px 8px;
    border: 0;
    background: none;
    font: 700 12px var(--font);
    white-space: nowrap;
    color: var(--muted);
    position: relative;
    z-index: 0;
  }
  .pi::before {
    content: '';
    position: absolute;
    inset: 8px 0;
    border-radius: 7px;
    background: var(--selected);
    z-index: -1;
  }
  .pi[aria-expanded='true']::before {
    outline: 1.5px solid currentColor;
  }
  svg {
    width: 14px;
    height: 14px;
  }
  .up {
    color: #9a3412;
  }
  .up::before {
    background: #fde4cf;
  }
  .down {
    color: #1e40af;
  }
  .down::before {
    background: #dbeafe;
  }
</style>
