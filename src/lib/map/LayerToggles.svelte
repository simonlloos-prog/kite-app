<script lang="ts">
  import { slide } from 'svelte/transition'
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

  /** The map settings fold into one button: room for the cards. */
  let open = $state(false)
</script>

<div class="toggles">
  <button
    type="button"
    class="menu"
    class:open
    title="Réglages de la carte"
    aria-label="Réglages de la carte"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <!-- Stacked layers. -->
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">
      <path d="M12 3.5 21 8l-9 4.5L3 8z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16 9 4.5 9-4.5" />
    </svg>
  </button>
  {#if open}
  <div class="group" transition:slide={{ duration: 160 }}>
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
    class="fav"
    class:on={app.favOnly}
    title={app.favorites.length ? 'Spots favoris seulement' : 'Pas encore de favori : ☆ dans la carte d’un spot'}
    aria-label="Spots favoris seulement"
    aria-pressed={app.favOnly}
    onclick={() => app.setFavOnly(!app.favOnly)}>★</button
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
  </div>
  {/if}
  <!-- Always at hand: what the map shows, not a preference. -->
  <button
    type="button"
    class="list kind"
    class:gust={app.kind === 'gust'}
    title="Vent moyen ou rafales"
    aria-label={app.kind === 'speed' ? 'Afficher les rafales' : 'Afficher le vent moyen'}
    onclick={() => (app.kind = app.kind === 'speed' ? 'gust' : 'speed')}>{app.kind === 'speed' ? 'Moy' : 'Raf'}</button
  >
  <button
    type="button"
    class="list rain"
    class:on={app.layers.rain}
    title="Pluie et orages (AROME)"
    aria-label="Pluie et orages"
    aria-pressed={app.layers.rain}
    onclick={() => (app.layers.rain = !app.layers.rain)}
  >
    <!-- A cloud, rain, and a small bolt. -->
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 15.5h9.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 15.5z" />
      <path d="M7.5 18.5l-1 2.5M11 18.5l-1 2.5" />
      <path d="M15.6 16.8l-1.6 2.6h2.4l-1.4 2.6" stroke-width="1.6" />
    </svg>
  </button>
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
    }}
  >
    <!-- Two arrows chasing each other round. -->
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19.5 10A7.6 7.6 0 0 0 5.8 7.2" />
      <path d="M4.5 14a7.6 7.6 0 0 0 13.7 2.8" />
      <path d="M19.8 4.6v5.6h-5.6" />
      <path d="M4.2 19.4v-5.6h5.6" />
    </svg>
  </button>
</div>

<style>
  .toggles {
    position: fixed;
    /* The settings button centred on the legend beside it (--legend-h, set by Legend). */
    top: calc(max(10px, 12px + var(--legend-h, 44px) / 2 - 22px) + env(safe-area-inset-top));
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
  .list.kind {
    font-size: 14px;
  }
  .list.kind.gust {
    background: var(--accent);
    color: #fff;
  }
  .list.rain.on {
    background: var(--accent);
    color: #fff;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .menu {
    background: var(--surface);
    color: var(--text);
    opacity: 1;
  }
  .menu.open {
    background: var(--accent);
    color: #fff;
  }
  .ico {
    display: block;
    width: 24px;
    height: 24px;
    margin: auto;
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
  .fav.on {
    color: #fde047;
  }
  .spinning .ico {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
