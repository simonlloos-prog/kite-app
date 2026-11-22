import { describe, expect, it } from 'vitest'
import { SPOTS } from './spots'
import { rideableWindows, spotHours, windowLabel } from './timeline'

const crohot = SPOTS.find((s) => s.id === 'grand-crohot')!
const key = (d: number, h: number) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`

describe('spot timeline', () => {
  // West wind, good at Le Grand Crohot: 8 kn, then 18 kn for 3 hours, 8 kn, 18 kn for 1 hour.
  const speeds = [8, 18, 18, 18, 8, 18, 8]
  const times = speeds.map((_, i) => key(22, 12 + i))
  const hours = spotHours(crohot, times, (t) => ({ speed: speeds[times.indexOf(t)], gust: 25, dir: 270 }), () => null)

  it('rates every hour', () => {
    expect(hours.map((h) => h.rating.score)).toEqual([0, 3, 3, 3, 0, 3, 0])
  })

  it('keeps the stretches of 2 hours or more', () => {
    expect(rideableWindows(hours)).toEqual([{ from: key(22, 13), to: key(22, 15), best: 3 }])
    expect(rideableWindows(hours, 1)).toHaveLength(2)
  })

  it('never counts the night', () => {
    const night = [20, 21, 22, 23].map((h) => key(22, h))
    const dark = spotHours(crohot, night, () => ({ speed: 18, gust: 25, dir: 270 }), () => null)
    expect(dark.every((h) => h.rating.score === 3 && !h.day)).toBe(true)
    expect(rideableWindows(dark)).toEqual([])
  })

  it('leaves out the hours not downloaded yet', () => {
    const none = spotHours(crohot, times, () => null, () => null)
    expect(rideableWindows(none)).toEqual([])
  })

  it('says when, ending with the last hour', () => {
    expect(windowLabel({ from: key(22, 13), to: key(22, 15), best: 3 }, '2026-11-22')).toBe('auj. 13 h – 16 h')
    expect(windowLabel({ from: key(23, 22), to: key(24, 1), best: 3 }, '2026-11-22')).toBe('lun. 22 h – mar. 2 h')
    expect(windowLabel({ from: key(23, 20), to: key(23, 23), best: 3 }, '2026-11-22')).toBe('lun. 20 h – minuit')
  })
})
