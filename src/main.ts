import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { startPwa } from './lib/pwa'

startPwa()

// iOS Safari ignores user-scalable=no: block its page pinch-zoom outside the map,
// which handles its own pinch gestures.
document.addEventListener('gesturestart', (e) => {
  if (!(e.target as Element).closest?.('.maplibregl-map')) e.preventDefault()
})

// iPhone home-screen app with a translucent status bar: iOS sizes 100vh/100lvh without the
// status bar, so full-height elements stop that much short of the bottom and leave an empty
// band. There, measure the physical screen instead: --screen-h is its height, --bottom-gap how
// far below the layout bottom it goes (0 everywhere else), for bottom-anchored elements.
function trackScreenHeight() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const portrait = matchMedia('(orientation: portrait)').matches
  const physical = standalone ? (portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)) : 0
  const root = document.documentElement.style
  root.setProperty('--screen-h', `${Math.max(innerHeight, physical)}px`)
  root.setProperty('--bottom-gap', `${Math.max(0, physical - innerHeight)}px`)
}
trackScreenHeight()
addEventListener('resize', trackScreenHeight)
addEventListener('orientationchange', trackScreenHeight)

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
