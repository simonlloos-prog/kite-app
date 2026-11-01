<script lang="ts">
  import { app } from '../stores/app.svelte'
  import type { GustTrend } from '../wind/pi'
  import { fmtSpeed } from '../wind/units'

  let { trend }: { trend: GustTrend } = $props()

  const label = $derived(
    trend.trend === 'flat'
      ? 'PI ='
      : `PI ${trend.trend === 'up' ? '↑ +' : '↓ −'}${fmtSpeed(Math.abs(trend.delta), app.unit)}`,
  )
</script>

<span
  class="pi {trend.trend}"
  title="Rafales AROME-PI (run horaire) comparées à AROME sur les 6 prochaines heures"
  aria-label="AROME-PI {trend.trend === 'up' ? 'à la hausse' : trend.trend === 'down' ? 'à la baisse' : 'stable'}"
  >{label}</span
>

<style>
  .pi {
    flex: none;
    padding: 1px 5px;
    border-radius: 6px;
    font: 700 11px var(--font);
    white-space: nowrap;
    background: var(--selected);
    color: var(--muted);
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
