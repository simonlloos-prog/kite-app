<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { UNIT_LABEL } from '../wind/units'

  const toggles = [
    { key: 'field', label: '▦', title: 'Couleurs du vent' },
    { key: 'values', label: '12', title: 'Valeurs de vent' },
    { key: 'arrows', label: '➚', title: 'Flèches de vent' },
    { key: 'spots', label: '●', title: 'Spots' },
  ] as const
</script>

<div class="toggles">
  {#each toggles as t (t.key)}
    <button
      type="button"
      title={t.title}
      aria-label={t.title}
      aria-pressed={app.layers[t.key]}
      class:on={app.layers[t.key]}
      onclick={() => (app.layers[t.key] = !app.layers[t.key])}>{t.label}</button
    >
  {/each}
  <button
    type="button"
    class="kind on"
    title="Vent moyen ou rafales"
    aria-label={app.kind === 'speed' ? 'Afficher les rafales' : 'Afficher le vent moyen'}
    onclick={() => (app.kind = app.kind === 'speed' ? 'gust' : 'speed')}>{app.kind === 'speed' ? 'Moy' : 'Raf'}</button
  >
  <button
    type="button"
    class="kind on"
    title="Unité : nœuds ou km/h"
    aria-label={app.unit === 'kn' ? 'Afficher en km/h' : 'Afficher en nœuds'}
    onclick={() => {
      app.unit = app.unit === 'kn' ? 'kmh' : 'kn'
      app.savePrefs()
    }}>{UNIT_LABEL[app.unit]}</button
  >
  <button
    type="button"
    class="list"
    title="Liste des spots"
    aria-label="Liste des spots"
    onclick={() => (app.snap = app.snap === 'closed' ? 'half' : 'closed')}>☰</button
  >
</div>

<style>
  .toggles {
    position: fixed;
    top: calc(10px + env(safe-area-inset-top));
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 2;
  }
  button {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: var(--surface);
    color: var(--muted);
    font: 700 15px var(--font);
    box-shadow: var(--shadow);
    opacity: 0.85;
  }
  button.on {
    background: var(--accent);
    color: #fff;
    opacity: 1;
  }
  .kind {
    font-size: 13px;
  }
  .list {
    margin-top: 8px;
    background: var(--surface);
    color: var(--text);
    opacity: 1;
    font-size: 20px;
  }
</style>
