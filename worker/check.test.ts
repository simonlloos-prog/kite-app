import { describe, expect, it } from 'vitest'
import { aromeCandidates, decide, firstStepUrl } from './check'

const at = (iso: string) => Date.parse(iso)
const pub = { run: '2026-11-07T09:00:00Z', pi: { run: '2026-11-07T16:00:00Z' } }

describe('scheduled check', () => {
  it('lists the AROME runs of the last 9 hours, newest first', () => {
    expect(aromeCandidates(at('2026-11-07T17:42:10Z'))).toEqual(['2026-11-07T15:00:00Z', '2026-11-07T12:00:00Z', '2026-11-07T09:00:00Z'])
    expect(aromeCandidates(at('2026-11-07T01:00:00Z'))[1]).toBe('2026-11-06T21:00:00Z')
    expect(firstStepUrl('2026-11-07T12:00:00Z')).toBe(
      'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/2026-11-07T12:00:00Z/arome/001/SP1/arome__001__SP1__03H__2026-11-07T12:00:00Z.grib2',
    )
  })

  it('wakes the workflow up for a new AROME run, once', () => {
    const now = at('2026-11-07T17:00:00Z')
    expect(decide(pub, '2026-11-07T12:00:00Z', now, null).dispatch).toBe(true)
    expect(decide(pub, '2026-11-07T12:00:00Z', now, now - 3 * 60_000).dispatch).toBe(false)
    expect(decide(pub, '2026-11-07T09:00:00Z', now, null)).toEqual({ dispatch: false, reason: 'rien de nouveau' })
  })

  it('wakes it up when AROME-PI is due, every 15 min while it is late', () => {
    expect(decide(pub, null, at('2026-11-07T17:30:00Z'), null).dispatch).toBe(false) // 16 h run + 1 h 30
    expect(decide(pub, null, at('2026-11-07T17:45:00Z'), null).dispatch).toBe(true) // + 1 h 45
    expect(decide(pub, null, at('2026-11-07T17:55:00Z'), at('2026-11-07T17:45:00Z')).dispatch).toBe(false)
    expect(decide(pub, null, at('2026-11-07T18:00:00Z'), at('2026-11-07T17:45:00Z')).dispatch).toBe(true)
  })

  it('keeps completing a run that is still coming out, then gives up', () => {
    const partial = { ...pub, run: '2026-11-07T12:00:00Z', runThrough: '2026-11-08T00:00Z', pi: { run: '2026-11-07T16:00:00Z' } }
    const now = at('2026-11-07T16:30:00Z')
    expect(decide(partial, null, now, null).dispatch).toBe(true)
    expect(decide(partial, null, now, now - 3 * 60_000).dispatch).toBe(false)
    expect(decide(partial, null, now, now - 5 * 60_000).dispatch).toBe(true)
    expect(decide({ ...partial, pi: { run: '2026-11-07T19:00:00Z' } }, null, at('2026-11-07T19:30:00Z'), null).reason).toBe('rien de nouveau')
  })

  it('fills an empty bucket', () => {
    expect(decide(null, null, at('2026-11-07T17:00:00Z'), null).dispatch).toBe(true)
  })
})
