import { describe, expect, it } from 'vitest'
import { dirQuality, rateSpot } from './rating'
import { distanceKm, nearestSpot, SPOTS, windPointOf, type Spot } from './spots'

const spot: Spot = { id: 't', name: 'Test', area: 'Test', lat: 44.7, lon: -1.1, good: ['O', 'SO'], ok: ['NO'], level: 'Débutant' }

describe('spots', () => {
  it('has unique ids and every spot inside the AROME area', () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length)
    for (const s of SPOTS) {
      expect(s.lat).toBeGreaterThan(43.55)
      expect(s.lat).toBeLessThan(45.85)
      expect(s.lon).toBeGreaterThan(-2)
      expect(s.lon).toBeLessThan(-0.6)
      expect(s.good.length).toBeGreaterThan(0)
    }
  })

  it('reads the wind just off each spot', () => {
    for (const s of SPOTS) expect(distanceKm(s, windPointOf(s))).toBeLessThan(2)
    expect(windPointOf(spot)).toBe(spot)
  })

  it('finds the nearest spot within range', () => {
    const betey = SPOTS.find((s) => s.id === 'betey')!
    expect(nearestSpot({ lat: betey.lat + 0.002, lon: betey.lon })?.id).toBe('betey')
    expect(nearestSpot({ lat: 45.0, lon: -1.9 })).toBeNull()
    expect(distanceKm({ lat: 44, lon: -1 }, { lat: 45, lon: -1 })).toBeCloseTo(111.2, 0)
  })

  it('splits directions into good, average and bad, 45° each', () => {
    expect(dirQuality(spot, 270)).toBe('good')
    expect(dirQuality(spot, 230)).toBe('good')
    expect(dirQuality(spot, 315)).toBe('ok')
    expect(dirQuality(spot, 340)).toBe('bad')
    expect(dirQuality(spot, 90)).toBe('bad')
  })

  it('rates by direction then strength', () => {
    expect(rateSpot(spot, null).score).toBe(0)
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 90 }).label).toBe('Direction défavorable')
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 250 }).label).toBe('Bon')
    expect(rateSpot(spot, { speed: 13, gust: 18, dir: 270 }).label).toBe('Léger')
    expect(rateSpot(spot, { speed: 28, gust: 35, dir: 270 }).label).toBe('Fort')
    expect(rateSpot(spot, { speed: 8, gust: 10, dir: 270 }).label).toBe('Trop faible')
  })

  it('takes one notch off for an average direction', () => {
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 315 })).toMatchObject({ score: 1, label: 'Bon, direction moyenne' })
    expect(rateSpot(spot, { speed: 28, gust: 35, dir: 315 })).toMatchObject({ score: 1, label: 'Fort, direction moyenne' })
  })
})
