import { describe, expect, it, vi } from 'vitest'
import { keyOf, loadPoints, snapPoint, WindCache } from './cache'
import { gridPoints, pickStep, STEPS } from './grid'
import { buildUrl, parseResponse, valueAt, type WindSeries } from './openMeteo'
import { formatHour, parisHourKey } from './time'
import { angleDiff, beaufort, sector } from './units'
import { windColor } from './windColor'

const raw = (speed: number) => ({
  hourly: {
    time: ['2026-11-01T14:00', '2026-11-01T15:00'],
    wind_speed_10m: [speed, null],
    wind_direction_10m: [270, 280],
    wind_gusts_10m: [speed + 5, null],
  },
})

describe('openMeteo', () => {
  it('builds a multi-point URL for AROME HD in knots', () => {
    const url = new URL(buildUrl([{ lat: 44.675, lon: -1.175 }, { lat: 44.65, lon: -1.25 }]))
    expect(url.searchParams.get('latitude')).toBe('44.6750,44.6500')
    expect(url.searchParams.get('longitude')).toBe('-1.1750,-1.2500')
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd')
    expect(url.searchParams.get('wind_speed_unit')).toBe('kn')
  })

  it('parses single object and arrays, nulls become NaN', () => {
    const [one] = parseResponse(raw(12), 1)
    expect(one.speed[0]).toBe(12)
    expect(one.speed[1]).toBeNaN()
    expect(parseResponse([raw(1), raw(2)], 2).map((s) => s.speed[0])).toEqual([1, 2])
    expect(() => parseResponse([raw(1)], 2)).toThrow()
  })

  it('reads the value at a given hour', () => {
    const [s] = parseResponse(raw(18), 1)
    expect(valueAt(s, '2026-11-01T14:00')).toEqual({ speed: 18, gust: 23, dir: 270 })
    expect(valueAt(s, '2026-11-01T15:00')).toBeNull()
    expect(valueAt(s, '2030-01-01T00:00')).toBeNull()
  })
})

describe('cache', () => {
  it('snaps to the AROME HD mesh', () => {
    expect(keyOf({ lat: 44.68, lon: -1.17 })).toBe('44.6750,-1.1750')
    expect(keyOf({ lat: 44.6751, lon: -1.1749 })).toBe(keyOf(snapPoint({ lat: 44.68, lon: -1.17 })))
  })

  it('expires entries and dedupes missing points', () => {
    const c = new WindCache()
    const s = {} as WindSeries
    c.set(keyOf({ lat: 44.68, lon: -1.17 }), s, 0)
    expect(c.missing([{ lat: 44.68, lon: -1.17 }], 1000)).toEqual([])
    expect(c.missing([{ lat: 44.68, lon: -1.17 }], 31 * 60_000)).toHaveLength(1)
    expect(c.missing([{ lat: 44.7, lon: -1.2 }, { lat: 44.7001, lon: -1.2001 }], 0)).toHaveLength(1)
  })

  it('only fetches missing points', async () => {
    const c = new WindCache()
    const fetchMock = vi.fn(async (url: string) => {
      const n = new URL(url).searchParams.get('latitude')!.split(',').length
      return new Response(JSON.stringify(n === 1 ? raw(10) : Array.from({ length: n }, () => raw(10))))
    })
    vi.stubGlobal('fetch', fetchMock)
    await loadPoints([{ lat: 44.68, lon: -1.17 }], undefined, c)
    await loadPoints([{ lat: 44.68, lon: -1.17 }, { lat: 44.7, lon: -1.2 }], undefined, c)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('latitude')).toBe('44.7000')
    vi.unstubAllGlobals()
  })
})

describe('grid', () => {
  it('picks the smallest step that is wide enough', () => {
    expect(pickStep(0.0001)).toBe(STEPS[0])
    expect(pickStep(0.001)).toBe(0.1)
    expect(pickStep(1)).toBe(STEPS[STEPS.length - 1])
  })

  it('aligns points on multiples of the step and caps the count', () => {
    const b = { west: -1.3, south: 44.55, east: -1.0, north: 44.85 }
    const pts = gridPoints(b, 0.05, 0.05)
    expect(pts).toHaveLength(7 * 7)
    for (const p of pts) expect(keyOf(p)).toBe(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)
    expect(gridPoints(b, STEPS[0], STEPS[0], 200).length).toBeLessThanOrEqual(200)
  })
})

describe('units & time', () => {
  it('converts directions and Beaufort', () => {
    expect(sector(270)).toBe('O')
    expect(sector(-10)).toBe('N')
    expect(sector(315)).toBe('NO')
    expect(angleDiff(350, 10)).toBe(20)
    expect(beaufort(15)).toBe(4)
    expect(beaufort(70)).toBe(12)
  })

  it('formats Paris hours', () => {
    expect(parisHourKey(new Date('2026-11-01T13:30:00Z'))).toBe('2026-11-01T14:00')
    expect(parisHourKey(new Date('2026-07-01T13:30:00Z'))).toBe('2026-07-01T15:00')
    expect(formatHour('2026-11-01T14:00')).toBe('dim. 14h')
  })

  it('colors by strength', () => {
    expect(windColor(5)).not.toBe(windColor(18))
    expect(windColor(NaN)).toBe(windColor(0))
  })
})
