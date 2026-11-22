import { describe, expect, it } from 'vitest'
import { bucketize } from './obs'
import { archivePoints, ffvlApiPoints, ffvlObs, fromFfvl, fromHolfuy, fromMeteoFrance, fromWeameter, infoclimatObs, infoclimatPoints, parisToUtc } from './obsSources'

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

  it('reads an FFVL beacon page: km/h, Paris time, Latin-1 shown as UTF-8', () => {
    const page =
      '<div class="Titre" >Relev� du 21/11/2026 - 10:43</div><div class="Data"><table ><tr><th colspan="2" >Vent</th></tr>' +
      '<tr><td class="label">Direction :</td><td class="valeur"><b><big><font color = "#0000FF">SE : 134�</font></big></b></td></tr>' +
      '<tr><td class="label">Vitesse :</td><td class="valeur"><b><big><font color = "#0000FF">16 km/h</font></big></b></td></tr>' +
      '<tr><td class="label">Direction :</td><td class="valeur"><b><big><font color = "#FF0000">SE : 134�</font></big></b></td></tr>' +
      '<tr><td class="label">Vitesse :</td><td class="valeur"><b><big><font color = "#FF0000">28 km/h</font></b></big></big></td></tr>' +
      '<tr><td class="label">Vitesse minimum :</td><td class="valeur">7 km/h</td></tr>'
    expect(fromFfvl('64', page)).toEqual({
      id: 'ffvl-64',
      name: 'Pyla',
      source: 'FFVL',
      lat: 44.5761,
      lon: -1.2247,
      time: '2026-11-21T09:43:00Z',
      speed: 8.6, // 16 km/h
      dir: 134,
      gust: 15.1, // 28 km/h
    })
    expect(fromFfvl('64', '<html>maintenance</html>')).toBeNull()
  })

  it('reads the FFVL API: km/h, UTC seconds, newest reading last', () => {
    const releve = (date_releve: number, vmoy: number | null, vmax: number, direction: number) => ({ date_releve, vmoy, vmax, direction })
    const answer = {
      code: 0,
      data: [
        { provider_key: 'ffvl', balise_id: '12', releves: [releve(1795339986, 10, 20, 90)] },
        { provider_key: 'ffvl', balise_id: '64', releves: [releve(1795339986, 67, 78, 292), releve(1795339386, 60, 74, 270), releve(1795338786, null, 70, 270)] },
      ],
    }
    const points = ffvlApiPoints('64', answer)!
    expect(points.map((p) => p.t)).toEqual([1795339386000, 1795339986000]) // oldest first, no reading without wind
    expect(ffvlObs('64', points)).toEqual({ id: 'ffvl-64', name: 'Pyla', source: 'FFVL', lat: 44.5761, lon: -1.2247, time: '2026-11-22T09:33:06Z', speed: 36.2, dir: 292, gust: 42.1 })
    expect(ffvlApiPoints('64', { code: 2, data: null })).toBeNull() // Invalid API key
    expect(ffvlApiPoints('64', { code: 0, data: [] })).toBeNull()
  })

  it('reads an Infoclimat station: 10-minute readings in km/h, UTC', () => {
    const row = (dh: string, moy: number | null, raf10: number | null, dir: number | null) => ({ dh_utc: dh, vent_moyen: moy, vent_rafales: null, vent_rafales_10min: raf10, vent_direction: dir })
    const d = { hourly: { '000DZ': [row('2026-11-22 20:10:00', 15, 27.4, 245), row('2026-11-22 20:00:00', 17.7, 32.2, 245), row('2026-11-22 20:20:00', null, null, null)], _params: ['complements'] } }
    const points = infoclimatPoints('000DZ', d)!
    expect(points).toEqual([
      { t: Date.UTC(2026, 10, 22, 20, 0), speed: 9.6, gust: 17.4, dir: 245 },
      { t: Date.UTC(2026, 10, 22, 20, 10), speed: 8.1, gust: 14.8, dir: 245 },
    ])
    expect(infoclimatObs('000DZ', points)).toEqual({ id: 'infoclimat-000DZ', name: 'Lacanau', source: 'Infoclimat', lat: 45.00135, lon: -1.19415, time: '2026-11-22T20:10:00Z', speed: 8.1, dir: 245, gust: 14.8 })
    expect(infoclimatPoints('000DZ', { hourly: {} })).toBeNull()
  })
})
