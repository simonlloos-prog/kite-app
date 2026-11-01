<script lang="ts">
  /**
   * Hidden screen-size diagnostics, opened with a long press on ⟳: to debug layout issues
   * that only show on a real phone (iPhone home-screen app), from a screenshot.
   */
  let { onclose }: { onclose: () => void } = $props()

  /** Height in px of a probe element styled with `css`. */
  function probe(css: string): number {
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;left:0;top:0;width:1px;visibility:hidden;${css}`
    document.body.append(el)
    const h = el.getBoundingClientRect().height
    el.remove()
    return Math.round(h)
  }

  const rect = (sel: string) => {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    return r ? `${Math.round(r.top)} → ${Math.round(r.bottom)} (h ${Math.round(r.height)})` : '—'
  }

  function measure() {
    const css = getComputedStyle(document.documentElement)
    const mm = (q: string) => (matchMedia(q).matches ? 'oui' : 'non')
    return [
      ['innerHeight', innerHeight],
      ['outerHeight', outerHeight],
      ['visualViewport', Math.round(visualViewport?.height ?? 0)],
      ['clientHeight html', document.documentElement.clientHeight],
      ['screen', `${screen.width} × ${screen.height} @${devicePixelRatio}x`],
      ['100vh / lvh', `${probe('height:100vh')} / ${probe('height:100lvh')}`],
      ['100svh / dvh', `${probe('height:100svh')} / ${probe('height:100dvh')}`],
      ['inset: 0', probe('top:0;bottom:0')],
      ['safe top / bottom', `${probe('height:env(safe-area-inset-top)')} / ${probe('height:env(safe-area-inset-bottom)')}`],
      ['navigator.standalone', String((navigator as Navigator & { standalone?: boolean }).standalone)],
      ['display-mode standalone', mm('(display-mode: standalone)')],
      ['display-mode fullscreen', mm('(display-mode: fullscreen)')],
      ['--screen-h / --bottom-gap', `${css.getPropertyValue('--screen-h') || '—'} / ${css.getPropertyValue('--bottom-gap') || '—'}`],
      ['carte', rect('.map')],
      ['canvas', rect('.maplibregl-canvas')],
      ['module temps', rect('.dial')],
      ['body', rect('body')],
      ['userAgent', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)],
    ] as [string, string | number][]
  }

  let rows = $state(measure())
</script>

<div class="diag" role="dialog" aria-label="Diagnostic d'écran">
  <div class="head">
    <strong>Diagnostic écran</strong>
    <button type="button" onclick={() => (rows = measure())}>Remesurer</button>
    <button type="button" onclick={onclose}>✕</button>
  </div>
  <table>
    <tbody>
      {#each rows as [k, v] (k)}
        <tr><th>{k}</th><td>{v}</td></tr>
      {/each}
    </tbody>
  </table>
  <p>Fais une capture d'écran de ce tableau et envoie-la.</p>
</div>

<style>
  .diag {
    position: fixed;
    left: 8px;
    right: 8px;
    top: calc(60px + env(safe-area-inset-top));
    z-index: 10;
    max-height: 70vh;
    overflow: auto;
    padding: 10px;
    border-radius: 12px;
    background: rgb(11 19 32 / 0.92);
    color: #e2e8f0;
    font: 12px/1.35 ui-monospace, monospace;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .head strong {
    flex: 1;
    font-family: var(--font);
  }
  button {
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: #243247;
    color: #e2e8f0;
  }
  th {
    text-align: left;
    padding-right: 8px;
    color: #94a3b8;
    font-weight: 400;
    white-space: nowrap;
  }
  td {
    word-break: break-all;
  }
  p {
    margin: 8px 0 0;
    color: #94a3b8;
    font-family: var(--font);
  }
</style>
