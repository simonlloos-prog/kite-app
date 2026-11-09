import { describe, expect, it } from 'vitest'
import { fromHolfuy, fromHolfuyLive, fromMeteoFrance, fromWeameter, parisToUtc } from './obsSources'

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
    expect(fromHolfuyLive('1317', { dateTime: '2026-11-09 18:30:29', wind: { speed: 7.6, gust: 10.8, direction: 115 } })).toEqual({
      id: 'holfuy-1317',
      name: 'La Jenny',
      source: 'Holfuy',
      lat: 44.8566,
      lon: -1.21987,
      time: '2026-11-09T17:30:29Z',
      speed: 7.6,
      dir: 115,
      gust: 10.8,
    })
    expect(fromHolfuyLive('1317', { error: 'Sorry', errorCode: 'no_access' } as object)).toBeNull()
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
