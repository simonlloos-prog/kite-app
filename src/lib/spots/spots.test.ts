import { describe, expect, it } from 'vitest'
import { dirQuality, rateSpot } from './rating'
import { distanceKm, nearestSpot, SPOTS, windPointOf, type Spot } from './spots'

const spot: Spot = { id: 't', name: 'Test', area: 'Test', lat: 44.7, lon: -1.1, good: ['O', 'SO'], ok: ['NO'], offshore: ['E'], level: 'Débutant' }

describe('spots', () => {
  it('has unique ids and every spot inside the AROME area', () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length)
    for (const s of SPOTS) {
      expect(s.lat).toBeGreaterThan(43.55)
      expect(s.lat).toBeLessThan(45.85)
      expect(s.lon).toBeGreaterThan(-2)
      expect(s.lon).toBeLessThan(-0.6)
      expect(s.good.length).toBeGreaterThan(0)
      // A direction is in one list at most.
      const all = [...s.good, ...s.ok, ...s.offshore]
      expect(new Set(all).size).toBe(all.length)
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
    expect(dirQuality(spot, 90)).toBe('offshore')
    expect(dirQuality(spot, 180)).toBe('bad')
  })

  it('rates by direction then strength', () => {
    expect(rateSpot(spot, null).score).toBe(0)
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 180 }).label).toBe('Direction défavorable')
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 90 })).toMatchObject({ score: 0, label: 'Offshore ⚠ dangereux' })
    expect(rateSpot(spot, { speed: 8, gust: 10, dir: 90 }).label).toBe('Trop faible')
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 250 }).label).toBe('Bon')
    expect(rateSpot(spot, { speed: 13, gust: 18, dir: 270 }).label).toBe('Léger')
    expect(rateSpot(spot, { speed: 28, gust: 35, dir: 270 }).label).toBe('Fort')
    expect(rateSpot(spot, { speed: 8, gust: 10, dir: 270 }).label).toBe('Trop faible')
  })

  it('takes one notch off for an average direction', () => {
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 315 })).toMatchObject({ score: 1, label: 'Bon, direction moyenne' })
    expect(rateSpot(spot, { speed: 28, gust: 35, dir: 315 })).toMatchObject({ score: 1, label: 'Fort, direction moyenne' })
  })

  it('needs the tide inside the window around high water', () => {
    const bassin = { ...spot, tide: 2 }
    const wind = { speed: 20, gust: 25, dir: 270 }
    const at = (fromHigh: number) => ({ level: 0.5, rising: true, fromHigh, height: 0 })
    expect(rateSpot(bassin, wind, at(-1.5)).label).toBe('Bon')
    expect(rateSpot(bassin, wind, at(2.5))).toMatchObject({ score: 0, label: 'Marée trop basse' })
    expect(rateSpot(bassin, { ...wind, speed: 8 }, at(5)).label).toBe('Trop faible')
    expect(rateSpot(bassin, wind, null).label).toBe('Bon')
    expect(rateSpot(spot, wind, at(5)).label).toBe('Bon')
  })
})
