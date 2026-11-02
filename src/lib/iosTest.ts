/**
 * iPhone status-bar test (ios-test.html, a second home-screen app): with the translucent bar,
 * iOS 18 drew the page under the clock but left the bottom 59 px blank (see index.html). These
 * page-height variants (styles in app.css) are switched from the diagnostics without
 * reinstalling, to find one where iOS draws the whole screen.
 */
export const IOS_TEST = document.documentElement.hasAttribute('data-ios-test')

export const LAYOUTS = {
  actuelle: 'Actuelle (inset 0)',
  vh: 'Page 100vh',
  barre: 'Page + hauteur de la barre',
  ecran: "Page = hauteur de l'écran",
} as const
export type Layout = keyof typeof LAYOUTS

const KEY = 'kite-ios-layout'

export function savedLayout(): Layout {
  try {
    const l = localStorage.getItem(KEY)
    if (l && l in LAYOUTS) return l as Layout
  } catch {
    // Not remembered: start from the current layout.
  }
  return 'actuelle'
}

export function applyLayout(l: Layout) {
  const html = document.documentElement
  html.dataset.layout = l
  html.style.setProperty('--screen-h', `${screen.height}px`)
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // Applied for this visit only.
  }
}
