<script lang="ts">
  import { fmtWave, type WaveAt } from '../wind/wave'

  /** « houle 1,5 m · 11 s · O » and an arrow pointing where the waves go, like the wind arrows. */
  const { wave }: { wave: WaveAt } = $props()
</script>

<span class="wave"
  >houle {fmtWave(wave)}<svg viewBox="0 0 24 24" style:transform="rotate({wave.dir + 180}deg)" aria-hidden="true"
    ><path d="M12 2l6 9h-4.5v11h-3V11H6z" fill="currentColor" /></svg
  ></span
>

<style>
  .wave {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  svg {
    width: 13px;
    height: 13px;
    flex: none;
  }
</style>
