import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { startPwa } from './lib/pwa'

startPwa()

// Installed app (home screen): the page is 100vh tall, see app.css. iOS also sets navigator.standalone.
const installed =
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
document.documentElement.classList.toggle('installed', installed)

// iOS Safari ignores user-scalable=no: block its page pinch-zoom outside the map,
// which handles its own pinch gestures.
document.addEventListener('gesturestart', (e) => {
  if (!(e.target as Element).closest?.('.maplibregl-map')) e.preventDefault()
})

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
