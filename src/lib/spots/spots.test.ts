import { describe, expect, it } from 'vitest'
import { rateSpot } from './rating'
import { distanceKm, nearestSpot, SPOTS, type Spot } from './spots'

const spot: Spot = { id: 't', name: 'Test', lat: 44.7, lon: -1.1, sectors: ['O', 'SO'] }

describe('spots', () => {
  it('finds the nearest spot within range', () => {
    const ares = SPOTS.find((s) => s.id === 'ares')!
    expect(nearestSpot({ lat: ares.lat + 0.005, lon: ares.lon })?.id).toBe('ares')
    expect(nearestSpot({ lat: 45.5, lon: -1.1 })).toBeNull()
    expect(distanceKm({ lat: 44, lon: -1 }, { lat: 45, lon: -1 })).toBeCloseTo(111.2, 0)
  })

  it('rates by direction then strength', () => {
    expect(rateSpot(spot, null).score).toBe(0)
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 90 }).label).toBe('Direction défavorable')
    expect(rateSpot(spot, { speed: 20, gust: 25, dir: 250 }).label).toBe('Bon')
    expect(rateSpot(spot, { speed: 13, gust: 18, dir: 270 }).label).toBe('Léger')
    expect(rateSpot(spot, { speed: 28, gust: 35, dir: 270 }).label).toBe('Fort')
    expect(rateSpot(spot, { speed: 8, gust: 10, dir: 270 }).label).toBe('Trop faible')
  })
})
