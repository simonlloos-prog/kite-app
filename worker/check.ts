/**
 * When to wake the GitHub workflow up: the Worker's scheduled check (every 5 min) replaces an
 * external cron that woke it every 15 min whether or not anything was new.
 *
 * - A new AROME run counts once its step FIRST_STEP is on Météo-France's open-data bucket, as in
 *   pipeline/fetch_arome.py. It then comes out over about 50 min: while the published one is
 *   partial (runThrough), wake the workflow up regularly to complete it.
 * - AROME-PI runs every hour and is out about 40 to 60 min after its time: the next one is due
 *   PI_DUE_MIN after the published one. Checking it would mean parsing a 2 MB capabilities file,
 *   too much for the free plan's 10 ms of CPU: the workflow checks, and does nothing if it is
 *   not out yet.
 * - Never twice within a few minutes: a run takes 1 to 5 min to show up in meta.json.
 */

const AROME_BUCKET = 'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt'
const FIRST_STEP = '03' // Earlier steps are already in the past when a run comes out.

/** Next AROME-PI run expected this long after the published one's time. */
export const PI_DUE_MIN = 100
/** Wait after a wake-up: for a new AROME run, and while AROME-PI is late. Under the 5 min of the check, or it would skip one. */
export const AROME_WAIT_MIN = 4
export const PI_WAIT_MIN = 15
/** Stop trying to complete a run this long after its time: it normally takes about 4 h. */
export const PARTIAL_MAX_H = 7

export const firstStepUrl = (run: string) =>
  `${AROME_BUCKET}/${run}/arome/001/SP1/arome__001__SP1__${FIRST_STEP}H__${run}.grib2`

/** AROME runs (every 3 h) of the last 9 hours, newest first, as in meta.json: `2026-11-07T12:00:00Z`. */
export function aromeCandidates(now: number): string[] {
  const t = new Date(now)
  t.setUTCHours(t.getUTCHours() - (t.getUTCHours() % 3), 0, 0, 0)
  return [0, 1, 2].map((k) => new Date(t.getTime() - k * 3 * 3_600_000).toISOString().replace('.000Z', 'Z'))
}

export interface Published {
  run: string
  pi?: { run: string }
  runThrough?: string
}

export interface Decision {
  dispatch: boolean
  reason: string
}

const MIN = 60_000

export function decide(pub: Published | null, latestArome: string | null, now: number, lastDispatch: number | null): Decision {
  const since = lastDispatch === null ? Infinity : (now - lastDispatch) / MIN
  if (!pub) return since >= AROME_WAIT_MIN ? { dispatch: true, reason: 'rien de publié' } : { dispatch: false, reason: 'déjà lancé' }
  if (latestArome && latestArome > pub.run) {
    return since >= AROME_WAIT_MIN
      ? { dispatch: true, reason: `nouveau run AROME ${latestArome}` }
      : { dispatch: false, reason: `nouveau run AROME, déjà lancé il y a ${Math.floor(since)} min` }
  }
  if (pub.runThrough && now < Date.parse(pub.run) + PARTIAL_MAX_H * 60 * MIN) {
    return since >= AROME_WAIT_MIN
      ? { dispatch: true, reason: `run AROME en cours (jusqu'à ${pub.runThrough})` }
      : { dispatch: false, reason: `run AROME en cours, déjà lancé il y a ${Math.floor(since)} min` }
  }
  const piDue = !pub.pi || now >= Date.parse(pub.pi.run) + PI_DUE_MIN * MIN
  if (piDue) {
    return since >= PI_WAIT_MIN
      ? { dispatch: true, reason: 'AROME-PI attendu' }
      : { dispatch: false, reason: `AROME-PI attendu, déjà lancé il y a ${Math.floor(since)} min` }
  }
  return { dispatch: false, reason: 'rien de nouveau' }
}
