import { describe, expect, it } from 'vitest'
import { freshObs, mergeObs, nearestObs, obsClock, spinSeconds, type Obs } from './obs'

const at = (name: string, lat: number, lon: number, time = '2026-11-07T15:06:00Z'): Obs => ({ id: name, name, source: 'Météo-France', lat, lon, time, speed: 10, dir: 270 })
const capFerret = at('Cap Ferret', 44.6305, -1.251667)
const cazaux = at('Cazaux', 44.534667, -1.132, '2026-11-07T13:00:00Z')

describe('obs', () => {
  it('drops records the station stopped sending', () => {
    expect(freshObs([capFerret, cazaux], Date.parse('2026-11-07T15:30:00Z'))).toEqual([capFerret])
  })

  it('keeps the newest record of each station', () => {
    const later = { ...capFerret, time: '2026-11-07T15:12:00Z', speed: 12 }
    expect(mergeObs([capFerret, cazaux], [later])).toEqual([later, cazaux])
    expect(mergeObs([later], [capFerret])).toEqual([later])
  })

  it('finds the station of a spot, only when close enough', () => {
    expect(nearestObs({ lat: 44.64641, lon: -1.200347 }, [capFerret, cazaux])).toBe(capFerret) // Les Arbousiers, ~4 km
    expect(nearestObs({ lat: 44.797919, lon: -1.235184 }, [capFerret, cazaux])).toBeNull() // Le Grand Crohot, ~19 km
  })

  it('spins the fan faster with the wind, still when calm', () => {
    expect(spinSeconds(0)).toBe(0)
    expect(spinSeconds(0.9)).toBe(0)
    expect(spinSeconds(1)).toBe(8)
    expect(spinSeconds(4)).toBe(5)
    expect(spinSeconds(10)).toBe(2)
    expect(spinSeconds(40)).toBe(0.75)
    expect(spinSeconds(NaN)).toBe(0)
  })

  it('shows the time in Paris', () => {
    expect(obsClock('2026-11-07T15:06:00Z')).toBe('16 h 06')
    expect(obsClock('2026-07-07T15:06:00Z')).toBe('17 h 06')
  })
})
