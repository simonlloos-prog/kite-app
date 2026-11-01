<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { valueAt } from '../wind/openMeteo'
  import { windColor } from '../wind/windColor'

  const w = $derived(valueAt(app.target, app.selectedTime))
</script>

<div class="reticle" style:top="calc((100dvh - {app.mapPadBottom}px) / 2)">
  <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
    <g fill="none" stroke-linecap="round">
      <g stroke="#fff" stroke-width="5">
        <path d="M22 2v12M22 30v12M2 22h12M30 22h12" />
        <circle cx="22" cy="22" r="3" />
      </g>
      <g stroke="#0b1320" stroke-width="2.2">
        <path d="M22 2v12M22 30v12M2 22h12M30 22h12" />
        <circle cx="22" cy="22" r="3" />
      </g>
    </g>
  </svg>
  {#if w}
    <span class="tag" style:background={windColor(w.speed)}>{Math.round(w.speed)}</span>
  {/if}
</div>

<style>
  .reticle {
    position: fixed;
    left: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: top 250ms ease;
    z-index: 2;
  }
  svg {
    display: block;
  }
  .tag {
    position: absolute;
    left: 34px;
    top: -6px;
    min-width: 24px;
    padding: 1px 6px;
    border-radius: 10px;
    border: 2px solid #fff;
    color: #0b1320;
    font: 700 13px/18px var(--font);
    text-align: center;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  }
</style>
