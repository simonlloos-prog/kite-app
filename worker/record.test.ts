import { describe, expect, it } from 'vitest'
import type { Obs } from '../src/lib/wind/obs'
import { addReadings, KEEP_MS, pointsOf } from './record'

const now = Date.parse('2026-11-11T12:00:00Z')
const obs = (id: string, time: string, speed: number, gust?: number): Obs => ({ id, name: id, source: 'Météo-France', lat: 0, lon: 0, time, speed, dir: 270, gust })

describe('addReadings', () => {
  it('adds a reading per station and time, oldest first', () => {
    let s = addReadings({}, [obs('a', '2026-11-11T11:54:00Z', 12.3, 18.1)], now)
    s = addReadings(s, [obs('a', '2026-11-11T11:54:00Z', 12.3, 18.1)], now + 300_000)
    s = addReadings(s, [obs('a', '2026-11-11T12:00:00Z', 14)], now + 300_000)
    expect(s.a).toEqual([
      [Date.parse('2026-11-11T11:54:00Z') / 1000, 123, 181, 270],
      [now / 1000, 140, 140, 270],
    ])
  })

  it('drops readings older than KEEP_MS', () => {
    const s = addReadings({ a: [[(now - KEEP_MS) / 1000 - 1, 1, 1, 0]], b: [[(now - KEEP_MS) / 1000, 2, 2, 0]] }, [], now)
    expect(s).toEqual({ b: [[(now - KEEP_MS) / 1000, 2, 2, 0]] })
  })

  it('reads back as points in knots and ms', () => {
    const s = addReadings({}, [obs('a', '2026-11-11T12:00:00Z', 9.5, 15)], now)
    expect(pointsOf(s, 'a')).toEqual([{ t: now, speed: 9.5, gust: 15, dir: 270 }])
    expect(pointsOf(s, 'z')).toEqual([])
  })
})
