import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { applyLayout, IOS_TEST, savedLayout } from './lib/iosTest'
import { startPwa } from './lib/pwa'

startPwa()
if (IOS_TEST) applyLayout(savedLayout())

// iOS Safari ignores user-scalable=no: block its page pinch-zoom outside the map,
// which handles its own pinch gestures.
document.addEventListener('gesturestart', (e) => {
  if (!(e.target as Element).closest?.('.maplibregl-map')) e.preventDefault()
})

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
