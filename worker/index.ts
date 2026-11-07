/**
 * Data for the app, outside GitHub Pages so that new data never means rebuilding the app:
 * - GET /obs → { time, obs: Obs[] }: live wind at the stations.
 * - GET /data/<key> → forecast files (meta.json, hour files) from the R2 bucket kite-data,
 *   written by the GitHub workflow after each new run.
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

interface R2Object {
  body: ReadableStream
  httpEtag: string
  httpMetadata?: { contentType?: string; contentEncoding?: string; cacheControl?: string }
}

interface Env {
  METEOFRANCE_API_KEY: string
  DATA: { get(key: string): Promise<R2Object | null> }
}

const TTL_MS = 2 * 60_000
let cached: { at: number; body: Promise<string> } | null = null

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  // Public measurements: any page may read them (the app, and localhost in development).
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
}

/**
 * A forecast file. Hour files are stored gzipped (Content-Encoding: gzip) and sent as they are:
 * the browser inflates them. Their names carry the run, so they never change (immutable);
 * meta.json is rewritten in place (no-cache).
 */
async function dataFile(key: string, env: Env): Promise<Response> {
  const obj = key && !key.includes('..') ? await env.DATA.get(`data/${key}`) : null
  if (!obj) return new Response('introuvable', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } })
  const m = obj.httpMetadata ?? {}
  const h: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': m.contentType ?? 'application/octet-stream',
    'Cache-Control': m.cacheControl ?? 'no-cache',
    ETag: obj.httpEtag,
  }
  if (m.contentEncoding) h['Content-Encoding'] = m.contentEncoding
  // manual: the body is already compressed, Cloudflare must not compress it again.
  return new Response(obj.body, { headers: h, encodeBody: m.contentEncoding ? 'manual' : 'automatic' } as ResponseInit)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers })
    if (url.pathname.startsWith('/data/')) return dataFile(url.pathname.slice('/data/'.length), env)
    if (url.pathname !== '/obs') return new Response('Kite App : /obs, /data/…', { status: 404, headers })

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
