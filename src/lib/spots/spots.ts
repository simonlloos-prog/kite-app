import type { LatLon } from '../wind/arome'
import type { Sector } from '../wind/units'

export interface Spot extends LatLon {
  id: string
  name: string
  /** Wind directions (where it comes from) that work on this spot. */
  sectors: Sector[]
}

// Coordinates and sectors are indicative: to be checked on the ground.
export const SPOTS: Spot[] = [
  { id: 'cap-ferret-ocean', name: 'Cap Ferret océan', lat: 44.64, lon: -1.262, sectors: ['O', 'NO', 'SO'] },
  { id: 'mimbeau', name: 'Le Mimbeau', lat: 44.642, lon: -1.24, sectors: ['N', 'NE', 'E'] },
  { id: 'claouey', name: 'Claouey', lat: 44.733, lon: -1.18, sectors: ['O', 'SO'] },
  { id: 'ares', name: 'Arès', lat: 44.765, lon: -1.14, sectors: ['O', 'NO', 'SO'] },
  { id: 'andernos', name: 'Andernos', lat: 44.745, lon: -1.1, sectors: ['O', 'SO', 'NO'] },
  { id: 'taussat', name: 'Taussat', lat: 44.718, lon: -1.068, sectors: ['O', 'SO'] },
  { id: 'moulleau', name: 'Le Moulleau', lat: 44.648, lon: -1.215, sectors: ['N', 'NO'] },
  { id: 'pyla', name: 'Pyla / Dune', lat: 44.59, lon: -1.215, sectors: ['O', 'NO', 'SO'] },
  { id: 'grand-crohot', name: 'Grand Crohot', lat: 44.795, lon: -1.235, sectors: ['O', 'NO', 'SO'] },
  // North Médoc: Gironde estuary side and ocean side.
  { id: 'chambrette', name: 'La Chambrette', lat: 45.555, lon: -1.055, sectors: ['N', 'NO', 'NE'] },
  { id: 'soulac', name: 'Soulac', lat: 45.512, lon: -1.131, sectors: ['O', 'NO', 'SO'] },
  // Médoc lakes: spots on the east shore, westerlies blow across the lake.
  { id: 'hourtin', name: "Lac d'Hourtin", lat: 45.18, lon: -1.08, sectors: ['O', 'NO', 'SO'] },
  { id: 'lacanau-lac', name: 'Lac de Lacanau', lat: 45.025, lon: -1.115, sectors: ['O', 'NO', 'SO'] },
]

export function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function nearestSpot(p: LatLon, maxKm = 2, spots = SPOTS): Spot | null {
  let best: Spot | null = null
  let bestD = maxKm
  for (const s of spots) {
    const d = distanceKm(p, s)
    if (d <= bestD) [best, bestD] = [s, d]
  }
  return best
}
