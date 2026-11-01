import { describe, expect, it, vi } from 'vitest'
import { keyOf, loadPoints, snapPoint, WindCache } from './cache'
import { COLS, domainPoints, nearestNode, ROWS } from './domain'
import { bilinear, fieldAt, streamlines } from './field'
import { buildUrl, parseResponse, valueAt, type WindSeries } from './openMeteo'
import { formatHour, parisHourKey } from './time'
import { angleDiff, beaufort, sector } from './units'
import { BINS, binOf, windColor } from './windColor'

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

  it('survives a serialize/restore round trip, NaN included', () => {
    const c = new WindCache()
    const [s] = parseResponse(raw(12), 1)
    c.set('k', s, 1000)
    const back = new WindCache()
    back.restore(c.serialize(), 2000)
    expect(back.get('k', 2000)?.speed[0]).toBe(12)
    expect(back.get('k', 2000)?.speed[1]).toBeNaN()
    const stale = new WindCache()
    stale.restore(c.serialize(), 1000 + 31 * 60_000)
    expect(stale.get('k', 1000 + 31 * 60_000)).toBeUndefined()
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

describe('domain & field', () => {
  it('covers the Bassin with distinct cache keys, within the API quota', () => {
    const pts = domainPoints()
    expect(pts).toHaveLength(ROWS * COLS)
    expect(pts.length).toBeLessThanOrEqual(300)
    expect(new Set(pts.map(keyOf)).size).toBe(pts.length)
  })

  it('finds the nearest node, or nothing outside', () => {
    expect(nearestNode({ lat: 44.6761, lon: -1.1739 })).toEqual(domainPoints()[7 * COLS + 7])
    expect(nearestNode({ lat: 46, lon: -1.1 })).toBeNull()
  })

  it('interpolates bilinearly', () => {
    const g = [
      [0, 10],
      [20, 30],
    ]
    expect(bilinear(g, 0, 0)).toBe(0)
    expect(bilinear(g, 1, 1)).toBe(30)
    expect(bilinear(g, 0.5, 0.5)).toBe(15)
    expect(bilinear([[NaN, 1], [1, 1]], 0.5, 0.5)).toBeNaN()
  })

  /** Cache where every domain node has the same wind at 14:00. */
  const uniform = (dirs: (r: number) => number) => {
    const c = new WindCache()
    domainPoints().forEach((p, i) => {
      const [s] = parseResponse(raw(15), 1)
      s.dir = [dirs(Math.floor(i / COLS)), 0]
      c.set(keyOf(p), s)
    })
    return c
  }

  it('draws wind lines that go where the wind blows', () => {
    const lines = streamlines('2026-11-01T14:00', uniform(() => 270))
    expect(lines.some((l) => l.set === 0) && lines.some((l) => l.set === 1)).toBe(true)
    for (const l of lines) {
      const [first, last] = [l.coords[0], l.coords[l.coords.length - 1]]
      expect(last[0]).toBeGreaterThan(first[0]) // westerly wind → lines head east
      expect(last[1]).toBeCloseTo(first[1], 6)
      expect(l.bearing).toBeCloseTo(90, 3)
    }
  })

  it('averages directions as vectors and skips empty areas', () => {
    const lines = streamlines('2026-11-01T14:00', uniform((r) => (r % 2 ? 350 : 10)))
    const mid = lines.find((l) => l.set === 0)!
    expect(Math.min(mid.bearing, 360 - mid.bearing)).toBeGreaterThan(170) // from ~N → heads ~S
    expect(streamlines('2026-11-01T14:00', new WindCache())).toEqual([])
  })

  it('reads a field from the cache', () => {
    const c = new WindCache()
    const [s] = parseResponse(raw(12), 1)
    c.set(keyOf(domainPoints()[0]), s)
    const f = fieldAt('2026-11-01T14:00', 'gust', c)
    expect(f).toHaveLength(ROWS)
    expect(f[0][0]).toBe(17)
    expect(f[1][1]).toBeNaN()
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

  it('colors by strength in flat bins', () => {
    expect(windColor(0)).toBe('rgb(255 255 255)')
    expect(windColor(10)).toBe(windColor(11.9))
    expect(windColor(12)).not.toBe(windColor(11.9))
    expect(binOf(99)).toBe(BINS.length - 1)
    expect(binOf(NaN)).toBe(-1)
    expect(windColor(NaN)).toBe('rgb(148 163 184)')
  })
})
