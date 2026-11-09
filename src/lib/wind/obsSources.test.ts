import { describe, expect, it } from 'vitest'
import { bucketize } from './obs'
import { archivePoints, fromHolfuy, fromMeteoFrance, fromWeameter, parisToUtc } from './obsSources'

describe('obs sources', () => {
  it('turns Paris local time into UTC, summer and winter', () => {
    expect(parisToUtc(2026, 11, 7, 17, 8, 0).toISOString()).toBe('2026-11-07T16:08:00.000Z')
    expect(parisToUtc(2026, 7, 7, 17, 8, 0).toISOString()).toBe('2026-07-07T15:08:00.000Z')
    expect(parisToUtc(2026, 3, 29, 3, 30, 0).toISOString()).toBe('2026-03-29T01:30:00.000Z') // just after the switch
    expect(parisToUtc(2026, 10, 25, 3, 30, 0).toISOString()).toBe('2026-10-25T02:30:00.000Z') // back to winter
  })

  it('reads a Holfuy graph file: km/h, Paris time, last 10 minutes', () => {
    const js = `var unt = ['2026/11/07 16:50:00','2026/11/07 17:00:00','2026/11/07 17:02:00','2026/11/07 17:04:00'];
var gd_speed = [40,10,12,14];
var gd_gust = [60,15,20,18];
var gd_direction = [180,350,10,0];`
    expect(fromHolfuy('1491', js)).toEqual({
      id: 'holfuy-1491',
      name: 'La Hume',
      source: 'Holfuy',
      lat: 44.64542,
      lon: -1.11327,
      time: '2026-11-07T16:04:00Z',
      speed: 6.5, // (10 + 12 + 14) / 3 km/h; 16:50 is out of the 10 minutes
      dir: 1, // around north, not south; 12 km/h at 10° outweighs 10 km/h at 350°
      gust: 10.8, // 20 km/h
    })
    expect(fromHolfuy('1491', 'var unt = [];')).toBeNull()
    expect(archivePoints({ measurements: [{ dateTime: '2026-11-09 19:56:29', wind: { speed: 8.1, gust: 11.3, direction: 138 } }, { dateTime: '2026-11-09 19:55:29', wind: { speed: 7.6, gust: 9.2, direction: 135 } }] })).toEqual([
      { t: Date.parse('2026-11-09T19:55:29Z'), speed: 7.6, gust: 9.2, dir: 135 },
      { t: Date.parse('2026-11-09T19:56:29Z'), speed: 8.1, gust: 11.3, dir: 138 },
    ])
    expect(archivePoints({ error: 'Sorry', errorCode: 'no_access' } as object)).toBeNull()
  })

  it('reads Météo-France and Weameter records', () => {
    const mf = fromMeteoFrance('33236002', { lat: 44.63, lon: -1.25, validity_time: '2026-11-07T16:06:00Z', ff: 5, dd: 270 })
    expect(mf).toMatchObject({ name: 'Cap Ferret', speed: 9.7, dir: 270 })
    expect(mf).not.toHaveProperty('gust')
    expect(fromMeteoFrance('33236002', { lat: 0, lon: 0, validity_time: '', ff: null, dd: null })).toBeNull()
    const w = fromWeameter('andernos', { current: { epoch: 1794067093 }, Average: { '0': { wspeed: 4.44, wdir: 158, gmax: 5.3 } } })
    expect(w).toMatchObject({ name: 'Andernos', speed: 4.4, dir: 158, gust: 5.3, time: '2026-11-07T15:58:13Z' })
  })
})

describe('bucketize', () => {
  it('averages readings on round periods', () => {
    const t0 = Date.parse('2026-11-09T19:00:00Z')
    const p = (min: number, speed: number, gust: number, dir: number) => ({ t: t0 + min * 60_000, speed, gust, dir })
    expect(bucketize([p(1, 8, 10, 350), p(4, 12, 15, 10), p(6, 5, 6, 90)], 5)).toEqual([
      { t: t0, speed: 10, gust: 15, dir: 2 },
      { t: t0 + 5 * 60_000, speed: 5, gust: 6, dir: 90 },
    ])
  })
})
