/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from 'virtual:pwa-register'

let registration: ServiceWorkerRegistration | undefined

/** Register the service worker. `autoUpdate`: a new app version installs itself and reloads the page. */
export function startPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
      // Also look for a new version while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60_000)
    },
  })
}

/** Ask the server for a newer app version; if there is one, the page reloads with it. */
export async function checkForUpdate() {
  try {
    await registration?.update()
  } catch {
    // Offline: try again next time.
  }
}
