import { describe, expect, it } from 'vitest'
import { isDayHour, parisKeyToMs, sunTimes } from './sun'

const crohot = { lat: 44.8, lon: -1.24 }
const paris = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })

describe('sun', () => {
  it('rises and sets at the right time on the coast', () => {
    // 22 nov.: about 8 h 10 and 17 h 30 on the coast; 21 june: about 6 h 10 and 21 h 55.
    const nov = sunTimes(Date.UTC(2026, 10, 22, 12), crohot)
    expect(paris(nov.rise)).toMatch(/^08:(1|2)/)
    expect(paris(nov.set)).toMatch(/^17:(2|3)/)
    const june = sunTimes(Date.UTC(2026, 5, 21, 12), crohot)
    expect(paris(june.rise)).toMatch(/^06:(0|1)/)
    expect(paris(june.set)).toMatch(/^21:5/)
  })

  it('reads Paris hour keys, winter and summer', () => {
    expect(new Date(parisKeyToMs('2026-11-22T14:00')).toISOString()).toBe('2026-11-22T13:00:00.000Z')
    expect(new Date(parisKeyToMs('2026-07-01T14:00')).toISOString()).toBe('2026-07-01T12:00:00.000Z')
  })

  it('tells day hours from night ones', () => {
    expect(isDayHour('2026-11-22T12:00', crohot)).toBe(true)
    expect(isDayHour('2026-11-22T07:00', crohot)).toBe(false) // 7 h 30, before sunrise
    expect(isDayHour('2026-11-22T08:00', crohot)).toBe(true) // 8 h 30, after it
    expect(isDayHour('2026-11-22T16:00', crohot)).toBe(true)
    expect(isDayHour('2026-11-22T18:00', crohot)).toBe(false)
    expect(isDayHour('2026-11-22T21:00', crohot)).toBe(false)
  })
})
