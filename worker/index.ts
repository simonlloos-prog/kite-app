/**
 * Live wind at the stations, for the app: GET /obs → { time, obs: Obs[] }.
 *
 * Runs on Cloudflare Workers (free plan). The Météo-France key stays here as a secret
 * (METEOFRANCE_API_KEY), never in the app. GitHub Pages only serves files rebuilt by the
 * workflow, which put the measurements 10 to 35 minutes behind; this answers in seconds.
 *
 * The answer is kept 2 minutes in memory: however many phones ask, the sources see at most
 * one round of requests per 2 minutes per Cloudflare instance. The Cache API does not work
 * on *.workers.dev, hence the plain variable.
 *
 * Deploy: see worker/README.md.
 */
import { fetchAllObs } from '../src/lib/wind/obsSources'

interface Env {
  METEOFRANCE_API_KEY: string
}

const TTL_MS = 2 * 60_000
let cached: { at: number; body: Promise<string> } | null = null

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  // Public measurements: any page may read them (the app, and localhost in development).
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers })
    if (url.pathname !== '/obs') return new Response('Kite App : /obs', { status: 404, headers })

    // Concurrent requests share the same round of fetches.
    if (!cached || Date.now() - cached.at > TTL_MS) {
      const body = fetchAllObs(env.METEOFRANCE_API_KEY ?? '').then((obs) => JSON.stringify({ time: new Date().toISOString(), obs }))
      cached = { at: Date.now(), body }
      body.catch(() => (cached = null))
    }
    try {
      return new Response(await cached.body, { headers })
    } catch {
      return new Response(JSON.stringify({ error: 'stations indisponibles' }), { status: 502, headers })
    }
  },
}
