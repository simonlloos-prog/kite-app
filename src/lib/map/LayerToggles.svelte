<script lang="ts">
  import { app } from '../stores/app.svelte'
  import { UNIT_LABEL } from '../wind/units'

  const toggles = [
    { key: 'field', label: '▦', title: 'Couleurs du vent' },
    { key: 'values', label: '12', title: 'Valeurs de vent' },
    { key: 'arrows', label: '➚', title: 'Flèches de vent' },
    { key: 'spots', label: '●', title: 'Spots' },
    { key: 'obs', label: '◉', title: 'Balises : vent mesuré en direct' },
  ] as const

  // ⟳: tap = refresh; long press = screen diagnostics, for layout issues seen only on a phone.
  let pressTimer = 0
  let longPressed = false
  function pressStart() {
    longPressed = false
    pressTimer = window.setTimeout(() => {
      longPressed = true
      app.showDiagnostics = true
    }, 700)
  }
  const pressEnd = () => clearTimeout(pressTimer)
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
    title="Où et quand : prochains créneaux"
    aria-label="Où et quand : prochains créneaux"
    onclick={() => (app.slotsOpen = !app.slotsOpen)}
  >
    <!-- A crystal ball with the wind inside: the forecast of where and when. -->
    <svg class="ball" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11.5" cy="10.5" r="7" fill="currentColor" />
      <g fill="none" stroke="var(--surface)" stroke-width="1.6">
        <path d="M7 9h5.2a1.6 1.6 0 1 0-1.6-1.6" />
        <path d="M7.4 12.2h6a1.5 1.5 0 1 1-1.5 1.5" />
      </g>
      <path d="M8 17.6 L6.6 21.2 H16.4 L15 17.6" fill="none" stroke="currentColor" stroke-width="1.7" />
      <path d="M20.2 1.6Q20.2 3.6 22.2 3.6Q20.2 3.6 20.2 5.6Q20.2 3.6 18.2 3.6Q20.2 3.6 20.2 1.6Z" fill="currentColor" />
      <path d="M21.3 8Q21.3 9.2 22.5 9.2Q21.3 9.2 21.3 10.4Q21.3 9.2 20.1 9.2Q21.3 9.2 21.3 8Z" fill="currentColor" />
      <path d="M3 2.2Q3 3.5 4.3 3.5Q3 3.5 3 4.8Q3 3.5 1.7 3.5Q3 3.5 3 2.2Z" fill="currentColor" />
    </svg>
  </button>
  <button
    type="button"
    class="list"
    class:spinning={app.refreshing}
    title="Recharger : nouvelle version de l'app et dernières données (appui long : diagnostic écran)"
    aria-label="Recharger l'app et les données"
    onpointerdown={pressStart}
    onpointerup={pressEnd}
    onpointerleave={pressEnd}
    onpointercancel={pressEnd}
    oncontextmenu={(e) => e.preventDefault()}
    onclick={() => {
      if (!longPressed) app.refresh()
    }}>⟳</button
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
  .ball {
    display: block;
    width: 26px;
    height: 26px;
    margin: auto;
  }
  .list + .list {
    margin-top: 0;
  }
  .spinning {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
